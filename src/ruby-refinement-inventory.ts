import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDocumentOrientations } from "./document-orientation.js";
import { inspectPdf, type InspectPage } from "./pdf-inspector.js";
import { associateRubySpans, type RubySpan } from "./ruby-spans.js";
import type { SourceTextRef } from "./source-text.js";
import { reconstructPageFlow, type WritingOrientation } from "./text-flow.js";

const require = createRequire(import.meta.url);
const PDFJS_VERSION = (require("pdfjs-dist/package.json") as { version: string }).version;

const KNOWN_REASONS = new Set<string>([
  "unique-contiguous-span",
  "missing-glyph-geometry",
  "no-base",
  "ambiguous-base",
  "noncontiguous-base",
  "conflicting-annotations",
]);

export type RubyAnnotationEvidence =
  | "all-exact-with-geometry"
  | "missing-display-geometry"
  | "missing-glyph-mapping"
  | "has-unmapped-glyph-mapping"
  | "has-ambiguous-glyph-mapping"
  | "missing-glyphs";

export type RubyRefinementCandidate = {
  candidateId: string;
  page: number;
  rotation: number;
  orientation: WritingOrientation;
  status: RubySpan["status"];
  reason: RubySpan["reason"];
  knownReason: boolean;
  annotationEvidence: RubyAnnotationEvidence;
  annotationSourceRanges: SourceTextRef[];
  baseSourceRanges: SourceTextRef[];
  annotationGlyphCount: number;
  baseGlyphCount: number;
  alternativeCount: number;
  alternativeRangeCounts: number[];
  annotationItemCount: number;
  annotationFontRatioMin: number | null;
  annotationFontRatioMax: number | null;
  pageGlyphIssueCount: number;
};

export type PdfRubyRefinementInventory = {
  pdfId: string;
  sourceSha256: string;
  byteLength: number;
  pages: number;
  scannedPages: number;
  candidates: number;
  exactCandidates: number;
  unresolvedCandidates: number;
  reasonCounts: Record<string, number>;
  unresolvedReasonCounts: Record<string, number>;
  orientationCounts: Record<string, number>;
  rotationCounts: Record<string, number>;
  annotationEvidenceCounts: Record<string, number>;
  alternativeBucketCounts: Record<string, number>;
  featureCounts: Record<string, number>;
  pageGlyphIssueCandidates: number;
  sourceIntegrityIssues: string[];
  unknownReasonCount: number;
  candidateReports: RubyRefinementCandidate[];
};

export type RubyRefinementCorpusInventory = {
  schemaVersion: 1;
  pdfJsVersion: string;
  pdfs: number;
  pages: number;
  scannedPages: number;
  candidates: number;
  exactCandidates: number;
  unresolvedCandidates: number;
  reasonCounts: Record<string, number>;
  unresolvedReasonCounts: Record<string, number>;
  orientationCounts: Record<string, number>;
  rotationCounts: Record<string, number>;
  annotationEvidenceCounts: Record<string, number>;
  alternativeBucketCounts: Record<string, number>;
  featureCounts: Record<string, number>;
  pageGlyphIssueCandidates: number;
  sourceIntegrityIssues: number;
  unknownReasonCount: number;
  reports: PdfRubyRefinementInventory[];
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount;
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) increment(target, key, value);
}

function canonicalRanges(ranges: SourceTextRef[]): SourceTextRef[] {
  return [...ranges].sort((left, right) =>
    left.page - right.page ||
    left.itemIndex - right.itemIndex ||
    left.charStart - right.charStart ||
    left.charEnd - right.charEnd);
}

function candidateId(pdfId: string, page: number, ranges: SourceTextRef[]): string {
  const canonical = canonicalRanges(ranges)
    .map((range) => `${range.page}/${range.itemIndex}/${range.charStart}/${range.charEnd}`)
    .join(";");
  return sha256(`${pdfId}|${page}|${canonical}`).slice(0, 20);
}

function sourceIntegrityIssues(page: InspectPage, ranges: SourceTextRef[]): string[] {
  const issues: string[] = [];
  for (const range of ranges) {
    if (range.page !== page.page) {
      issues.push(`range page ${range.page} differs from candidate page ${page.page}`);
      continue;
    }
    const item = page.textItems[range.itemIndex];
    if (!item) {
      issues.push(`missing text item ${range.itemIndex}`);
      continue;
    }
    if (!Number.isInteger(range.charStart) || !Number.isInteger(range.charEnd) ||
        range.charStart < 0 || range.charEnd <= range.charStart || range.charEnd > item.text.length) {
      issues.push(`invalid source range item ${range.itemIndex} ${range.charStart}:${range.charEnd} length ${item.text.length}`);
    }
  }
  return issues;
}

function annotationItems(page: InspectPage, ranges: SourceTextRef[]) {
  const indexes = [...new Set(ranges.filter((range) => range.page === page.page).map((range) => range.itemIndex))].sort((a, b) => a - b);
  return indexes.map((index) => page.textItems[index]).filter((item) => item !== undefined);
}

function annotationEvidence(page: InspectPage, ranges: SourceTextRef[]): RubyAnnotationEvidence {
  const items = annotationItems(page, ranges);
  if (items.some((item) => !item.displayGeometry)) return "missing-display-geometry";
  if (items.some((item) => item.glyphMapping === undefined)) return "missing-glyph-mapping";
  if (items.some((item) => item.glyphMapping === "unmapped")) return "has-unmapped-glyph-mapping";
  if (items.some((item) => item.glyphMapping === "ambiguous")) return "has-ambiguous-glyph-mapping";
  if (items.some((item) => !item.glyphs?.length)) return "missing-glyphs";
  return "all-exact-with-geometry";
}

function alternativeBucket(count: number): string {
  if (count === 0) return "0";
  if (count === 1) return "1";
  return "2+";
}

function roundedRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function analyzeRubyRefinementCandidate(
  pdfId: string,
  page: InspectPage,
  orientation: WritingOrientation,
  bodyFontSize: number,
  span: RubySpan,
): { report: RubyRefinementCandidate; sourceIssues: string[] } {
  const annotationRanges = canonicalRanges(span.annotationSourceRanges);
  const baseRanges = canonicalRanges(span.baseSourceRanges);
  const sourceIssues = [
    ...sourceIntegrityIssues(page, annotationRanges).map((issue) => `annotation:${issue}`),
    ...sourceIntegrityIssues(page, baseRanges).map((issue) => `base:${issue}`),
    ...span.alternatives.flatMap((alternative, index) =>
      sourceIntegrityIssues(page, alternative).map((issue) => `alternative-${index}:${issue}`)),
  ];
  const items = annotationItems(page, annotationRanges);
  const ratios = bodyFontSize > 0
    ? items.filter((item) => Number.isFinite(item.fontSize) && item.fontSize > 0)
      .map((item) => item.fontSize / bodyFontSize)
    : [];

  return {
    report: {
      candidateId: candidateId(pdfId, page.page, annotationRanges),
      page: page.page,
      rotation: page.rotation,
      orientation,
      status: span.status,
      reason: span.reason,
      knownReason: KNOWN_REASONS.has(span.reason),
      annotationEvidence: annotationEvidence(page, annotationRanges),
      annotationSourceRanges: annotationRanges,
      baseSourceRanges: baseRanges,
      annotationGlyphCount: span.annotationGlyphRefs.length,
      baseGlyphCount: span.baseGlyphRefs.length,
      alternativeCount: span.alternatives.length,
      alternativeRangeCounts: span.alternatives.map((alternative) => alternative.length),
      annotationItemCount: items.length,
      annotationFontRatioMin: ratios.length ? roundedRatio(Math.min(...ratios)) : null,
      annotationFontRatioMax: ratios.length ? roundedRatio(Math.max(...ratios)) : null,
      pageGlyphIssueCount: page.glyphIssues?.length ?? 0,
    },
    sourceIssues,
  };
}

function summarizeCandidateReports(
  reports: RubyRefinementCandidate[],
  sourceIntegrityIssueCount: number,
) {
  const reasonCounts: Record<string, number> = {};
  const unresolvedReasonCounts: Record<string, number> = {};
  const orientationCounts: Record<string, number> = {};
  const rotationCounts: Record<string, number> = {};
  const annotationEvidenceCounts: Record<string, number> = {};
  const alternativeBucketCounts: Record<string, number> = {};
  const featureCounts: Record<string, number> = {};
  let exactCandidates = 0;
  let unresolvedCandidates = 0;
  let pageGlyphIssueCandidates = 0;
  let unknownReasonCount = 0;

  for (const report of reports) {
    increment(reasonCounts, report.reason);
    increment(orientationCounts, report.orientation);
    increment(rotationCounts, String(report.rotation));
    increment(annotationEvidenceCounts, report.annotationEvidence);
    increment(alternativeBucketCounts, alternativeBucket(report.alternativeCount));
    if (report.status === "exact") exactCandidates += 1;
    else {
      unresolvedCandidates += 1;
      increment(unresolvedReasonCounts, report.reason);
    }
    if (report.pageGlyphIssueCount > 0) pageGlyphIssueCandidates += 1;
    if (!report.knownReason) unknownReasonCount += 1;
    const feature = [
      report.reason,
      report.orientation,
      `rot${report.rotation}`,
      report.annotationEvidence,
      `alts:${alternativeBucket(report.alternativeCount)}`,
      report.pageGlyphIssueCount > 0 ? "page-glyph-issues" : "page-glyph-clean",
    ].join("|");
    increment(featureCounts, feature);
  }

  return {
    candidates: reports.length,
    exactCandidates,
    unresolvedCandidates,
    reasonCounts,
    unresolvedReasonCounts,
    orientationCounts,
    rotationCounts,
    annotationEvidenceCounts,
    alternativeBucketCounts,
    featureCounts,
    pageGlyphIssueCandidates,
    sourceIntegrityIssueCount,
    unknownReasonCount,
  };
}

export async function inspectRubyRefinementPdf(inputPath: string): Promise<PdfRubyRefinementInventory> {
  const bytes = new Uint8Array(await readFile(inputPath));
  const sourceSha256 = sha256(bytes);
  const pdfId = `sha256:${sourceSha256.slice(0, 16)}`;
  const inspection = await inspectPdf(inputPath, { includeGlyphs: true });
  const flows = inspection.pages.map((page) => ({ page, flow: reconstructPageFlow(page) }));
  const orientations = new Map(resolveDocumentOrientations(flows.map(({ page, flow }) => ({
    page: page.page,
    orientation: flow.orientation,
  }))).map((entry) => [entry.page, entry.resolved]));

  const candidateReports: RubyRefinementCandidate[] = [];
  const integrityIssues: string[] = [];
  for (const { page, flow } of flows) {
    const orientation = orientations.get(page.page) ?? flow.orientation;
    for (const span of associateRubySpans(page, flow.bodyFontSize)) {
      const analyzed = analyzeRubyRefinementCandidate(pdfId, page, orientation, flow.bodyFontSize, span);
      candidateReports.push(analyzed.report);
      integrityIssues.push(...analyzed.sourceIssues.map((issue) => `page-${page.page}/${analyzed.report.candidateId}:${issue}`));
    }
  }

  const summary = summarizeCandidateReports(candidateReports, integrityIssues.length);
  return {
    pdfId,
    sourceSha256,
    byteLength: bytes.byteLength,
    pages: inspection.pageCount,
    scannedPages: inspection.pages.length,
    candidates: summary.candidates,
    exactCandidates: summary.exactCandidates,
    unresolvedCandidates: summary.unresolvedCandidates,
    reasonCounts: summary.reasonCounts,
    unresolvedReasonCounts: summary.unresolvedReasonCounts,
    orientationCounts: summary.orientationCounts,
    rotationCounts: summary.rotationCounts,
    annotationEvidenceCounts: summary.annotationEvidenceCounts,
    alternativeBucketCounts: summary.alternativeBucketCounts,
    featureCounts: summary.featureCounts,
    pageGlyphIssueCandidates: summary.pageGlyphIssueCandidates,
    sourceIntegrityIssues: integrityIssues,
    unknownReasonCount: summary.unknownReasonCount,
    candidateReports,
  };
}

export function summarizeRubyRefinementCorpus(reports: PdfRubyRefinementInventory[]): RubyRefinementCorpusInventory {
  const reasonCounts: Record<string, number> = {};
  const unresolvedReasonCounts: Record<string, number> = {};
  const orientationCounts: Record<string, number> = {};
  const rotationCounts: Record<string, number> = {};
  const annotationEvidenceCounts: Record<string, number> = {};
  const alternativeBucketCounts: Record<string, number> = {};
  const featureCounts: Record<string, number> = {};
  for (const report of reports) {
    mergeCounts(reasonCounts, report.reasonCounts);
    mergeCounts(unresolvedReasonCounts, report.unresolvedReasonCounts);
    mergeCounts(orientationCounts, report.orientationCounts);
    mergeCounts(rotationCounts, report.rotationCounts);
    mergeCounts(annotationEvidenceCounts, report.annotationEvidenceCounts);
    mergeCounts(alternativeBucketCounts, report.alternativeBucketCounts);
    mergeCounts(featureCounts, report.featureCounts);
  }
  return {
    schemaVersion: 1,
    pdfJsVersion: PDFJS_VERSION,
    pdfs: reports.length,
    pages: reports.reduce((sum, report) => sum + report.pages, 0),
    scannedPages: reports.reduce((sum, report) => sum + report.scannedPages, 0),
    candidates: reports.reduce((sum, report) => sum + report.candidates, 0),
    exactCandidates: reports.reduce((sum, report) => sum + report.exactCandidates, 0),
    unresolvedCandidates: reports.reduce((sum, report) => sum + report.unresolvedCandidates, 0),
    reasonCounts,
    unresolvedReasonCounts,
    orientationCounts,
    rotationCounts,
    annotationEvidenceCounts,
    alternativeBucketCounts,
    featureCounts,
    pageGlyphIssueCandidates: reports.reduce((sum, report) => sum + report.pageGlyphIssueCandidates, 0),
    sourceIntegrityIssues: reports.reduce((sum, report) => sum + report.sourceIntegrityIssues.length, 0),
    unknownReasonCount: reports.reduce((sum, report) => sum + report.unknownReasonCount, 0),
    reports,
  };
}

function nonNegativeInteger(value: string | undefined, flag: string): number {
  if (value === undefined) throw new Error(`missing value for ${flag}`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer`);
  return parsed;
}

async function pdfFiles(input: string): Promise<string[]> {
  const metadata = await stat(input);
  if (!metadata.isDirectory()) return [input];
  const files = (await readdir(input, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => path.join(input, entry.name))
    .sort();
  if (files.length === 0) throw new Error("no PDF files found");
  return files;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const input = argv.shift();
  if (!input || input.startsWith("--")) {
    throw new Error("usage: npm run inspect:ruby-refinement -- PDF_OR_DIRECTORY --output NEW_FILE [--expect-pdf-count N] [--expect-page-count N] [--expect-unresolved-count N]");
  }
  let output: string | undefined;
  let expectedPdfs: number | undefined;
  let expectedPages: number | undefined;
  let expectedUnresolved: number | undefined;
  while (argv.length > 0) {
    const flag = argv.shift()!;
    const value = argv.shift();
    if (flag === "--output") {
      if (!value || value.startsWith("--")) throw new Error("missing value for --output");
      output = value;
    } else if (flag === "--expect-pdf-count") expectedPdfs = nonNegativeInteger(value, flag);
    else if (flag === "--expect-page-count") expectedPages = nonNegativeInteger(value, flag);
    else if (flag === "--expect-unresolved-count") expectedUnresolved = nonNegativeInteger(value, flag);
    else throw new Error(`unknown option ${flag}`);
  }
  if (!output) throw new Error("--output NEW_FILE is required; ruby refinement reports are local-only");

  const files = await pdfFiles(input);
  const reports: PdfRubyRefinementInventory[] = [];
  for (const [index, file] of files.entries()) {
    process.stderr.write(`Ruby refinement inventory: ${index + 1}/${files.length}\n`);
    reports.push(await inspectRubyRefinementPdf(file));
  }
  const report = summarizeRubyRefinementCorpus(reports);
  if (expectedPdfs !== undefined && report.pdfs !== expectedPdfs) {
    throw new Error(`PDF count mismatch: expected ${expectedPdfs}, got ${report.pdfs}`);
  }
  if (expectedPages !== undefined && report.pages !== expectedPages) {
    throw new Error(`page count mismatch: expected ${expectedPages}, got ${report.pages}`);
  }
  if (expectedUnresolved !== undefined && report.unresolvedCandidates !== expectedUnresolved) {
    throw new Error(`unresolved ruby count mismatch: expected ${expectedUnresolved}, got ${report.unresolvedCandidates}`);
  }
  if (report.scannedPages !== report.pages) {
    throw new Error(`ruby refinement inventory scanned ${report.scannedPages}/${report.pages} pages`);
  }
  if (report.sourceIntegrityIssues !== 0) {
    throw new Error(`ruby refinement inventory found ${report.sourceIntegrityIssues} source integrity issues`);
  }
  if (report.unknownReasonCount !== 0) {
    throw new Error(`ruby refinement inventory found ${report.unknownReasonCount} candidates with unknown reasons`);
  }

  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write([
    `PDFS=${report.pdfs}`,
    `PAGES=${report.pages}`,
    `RUBY_CANDIDATES=${report.candidates}`,
    `EXACT_CANDIDATES=${report.exactCandidates}`,
    `UNRESOLVED_CANDIDATES=${report.unresolvedCandidates}`,
    `REASON_COUNTS=${JSON.stringify(report.reasonCounts)}`,
    `UNRESOLVED_REASON_COUNTS=${JSON.stringify(report.unresolvedReasonCounts)}`,
    `ORIENTATION_COUNTS=${JSON.stringify(report.orientationCounts)}`,
    `ROTATION_COUNTS=${JSON.stringify(report.rotationCounts)}`,
    `ANNOTATION_EVIDENCE_COUNTS=${JSON.stringify(report.annotationEvidenceCounts)}`,
    `ALTERNATIVE_BUCKET_COUNTS=${JSON.stringify(report.alternativeBucketCounts)}`,
    `PAGE_GLYPH_ISSUE_CANDIDATES=${report.pageGlyphIssueCandidates}`,
    `SOURCE_INTEGRITY_ISSUES=${report.sourceIntegrityIssues}`,
    `UNKNOWN_REASON_COUNT=${report.unknownReasonCount}`,
  ].join("\n") + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dot } from "./display-geometry.js";
import { resolveDocumentOrientations } from "./document-orientation.js";
import { inspectPdf, type InspectPage, type InspectTextItem } from "./pdf-inspector.js";
import { analyzeRubyRefinementCandidate } from "./ruby-refinement-inventory.js";
import { associateRubySpans, type RubySpan } from "./ruby-spans.js";
import type { SourceTextRef } from "./source-text.js";
import { reconstructPageFlow, type WritingOrientation } from "./text-flow.js";

export type RubyNearMissGate =
  | "eligible"
  | "axis-mismatch"
  | "body-skew"
  | "font-ratio-low"
  | "font-ratio-high"
  | "side-opposite"
  | "side-too-near"
  | "side-too-far"
  | "inline-too-far";

export type RubyBodyNearMiss = {
  itemIndex: number;
  gates: RubyNearMissGate[];
  score: number;
  fontRatio: number | null;
  crossDistanceRatio: number | null;
  inlineGapRatio: number | null;
};

export type RubyNearMissCandidate = {
  candidateId: string;
  page: number;
  rotation: number;
  orientation: WritingOrientation;
  status: RubySpan["status"];
  reason: RubySpan["reason"];
  annotationSourceRanges: SourceTextRef[];
  nearest: RubyBodyNearMiss | null;
  axisAlignedBodyEntries: number;
  eligibleBodyEntries: number;
  actualBaseEntries: number;
  actualBaseEligibleEntries: number;
};

export type PdfRubyNearMissEvidence = {
  pdfId: string;
  sourceSha256: string;
  pages: number;
  candidates: number;
  exactCandidates: number;
  unresolvedCandidates: number;
  reasonCounts: Record<string, number>;
  unresolvedReasonCounts: Record<string, number>;
  nearestGateCounts: Record<string, number>;
  unresolvedNearestGateCounts: Record<string, number>;
  noBaseNearestGateCounts: Record<string, number>;
  noBaseFontRatioBuckets: Record<string, number>;
  noBaseCrossDistanceBuckets: Record<string, number>;
  noBaseInlineGapBuckets: Record<string, number>;
  exactActualBaseEligibility: Record<string, number>;
  reports: RubyNearMissCandidate[];
};

export type RubyNearMissCorpusEvidence = {
  schemaVersion: 1;
  pdfs: number;
  pages: number;
  candidates: number;
  exactCandidates: number;
  unresolvedCandidates: number;
  reasonCounts: Record<string, number>;
  unresolvedReasonCounts: Record<string, number>;
  nearestGateCounts: Record<string, number>;
  unresolvedNearestGateCounts: Record<string, number>;
  noBaseNearestGateCounts: Record<string, number>;
  noBaseFontRatioBuckets: Record<string, number>;
  noBaseCrossDistanceBuckets: Record<string, number>;
  noBaseInlineGapBuckets: Record<string, number>;
  exactActualBaseEligibility: Record<string, number>;
  reports: PdfRubyNearMissEvidence[];
};

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount;
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, count] of Object.entries(source)) increment(target, key, count);
}

function uniqueItemIndexes(ranges: SourceTextRef[]): number[] {
  return [...new Set(ranges.map((range) => range.itemIndex))].sort((left, right) => left - right);
}

function annotationItems(page: InspectPage, span: RubySpan): InspectTextItem[] {
  return uniqueItemIndexes(span.annotationSourceRanges)
    .map((index) => page.textItems[index])
    .filter((item): item is InspectTextItem => item !== undefined);
}

function annotationGeometry(page: InspectPage, span: RubySpan) {
  const items = annotationItems(page, span);
  const first = items[0]?.displayGeometry;
  if (!first || items.some((item) => !item.displayGeometry || item.glyphMapping !== "exact" || !item.glyphs?.length)) {
    return null;
  }
  const glyphs = items.flatMap((item) => item.glyphs ?? []);
  if (glyphs.length === 0) return null;
  const start = Math.min(...glyphs.map((glyph) => dot(glyph.geometry.start, first.inline)));
  const end = Math.max(...glyphs.map((glyph) => dot(glyph.geometry.end, first.inline)));
  return { geometry: first, start, end };
}

function inlineGapRatio(item: InspectTextItem, inline: { x: number; y: number }, start: number, end: number): number | null {
  const geometry = item.displayGeometry;
  if (!geometry || geometry.crossExtent <= 0) return null;
  const bodyStart = dot(geometry.start, inline);
  const bodyEnd = dot(geometry.end, inline);
  const lo = Math.min(bodyStart, bodyEnd);
  const hi = Math.max(bodyStart, bodyEnd);
  const gap = hi < start ? start - hi : lo > end ? lo - end : 0;
  return gap / geometry.crossExtent;
}

function gateSignature(gates: RubyNearMissGate[]): string {
  return gates.length === 0 ? "eligible" : [...gates].sort().join("+");
}

function bodyEvidence(item: InspectTextItem, itemIndex: number, annotation: NonNullable<ReturnType<typeof annotationGeometry>>): RubyBodyNearMiss | null {
  const body = item.displayGeometry;
  if (!body || body.crossExtent <= 0) return null;
  const a = annotation.geometry;
  const gates: RubyNearMissGate[] = [];
  const inlineDot = dot(body.inline, a.inline);
  const sideDot = dot(body.side, a.side);
  const skew = Math.abs(dot(body.inline, body.side));
  if (inlineDot < 0.999 || sideDot < 0.999) gates.push("axis-mismatch");
  if (skew > 0.01) gates.push("body-skew");

  const fontRatio = a.crossExtent / body.crossExtent;
  if (fontRatio < 0.35) gates.push("font-ratio-low");
  if (fontRatio >= 0.75) gates.push("font-ratio-high");

  const crossDistance = dot(a.start, a.side) - dot(body.start, a.side);
  const crossDistanceRatio = crossDistance / body.crossExtent;
  if (crossDistanceRatio < 0) gates.push("side-opposite");
  else if (crossDistanceRatio < 0.45) gates.push("side-too-near");
  else if (crossDistanceRatio > 1.35) gates.push("side-too-far");

  const inlineGap = inlineGapRatio(item, a.inline, annotation.start, annotation.end);
  if (inlineGap !== null && inlineGap > 0.5) gates.push("inline-too-far");

  const score =
    (inlineDot < 0.999 || sideDot < 0.999 ? 20 : 0) +
    (skew > 0.01 ? 20 : 0) +
    (fontRatio < 0.35 ? (0.35 - fontRatio) / 0.35 : fontRatio >= 0.75 ? (fontRatio - 0.75) / 0.75 + 0.01 : 0) +
    (crossDistanceRatio < 0 ? 3 + Math.abs(crossDistanceRatio) : crossDistanceRatio < 0.45 ? (0.45 - crossDistanceRatio) / 0.45 : crossDistanceRatio > 1.35 ? (crossDistanceRatio - 1.35) / 1.35 : 0) +
    (inlineGap !== null && inlineGap > 0.5 ? (inlineGap - 0.5) / 0.5 : 0);

  return {
    itemIndex,
    gates: gates.length === 0 ? ["eligible"] : gates,
    score: Math.round(score * 10000) / 10000,
    fontRatio: Math.round(fontRatio * 10000) / 10000,
    crossDistanceRatio: Math.round(crossDistanceRatio * 10000) / 10000,
    inlineGapRatio: inlineGap === null ? null : Math.round(inlineGap * 10000) / 10000,
  };
}

function bodyEntries(page: InspectPage, bodyFontSize: number): Array<{ item: InspectTextItem; itemIndex: number }> {
  return page.textItems
    .map((item, itemIndex) => ({ item, itemIndex }))
    .filter(({ item }) => item.text.trim().length > 0 && item.fontSize >= bodyFontSize * 0.75);
}

function bestBodyEvidence(page: InspectPage, bodyFontSize: number, span: RubySpan): {
  nearest: RubyBodyNearMiss | null;
  axisAlignedBodyEntries: number;
  eligibleBodyEntries: number;
  actualBaseEntries: number;
  actualBaseEligibleEntries: number;
} {
  const annotation = annotationGeometry(page, span);
  if (!annotation) {
    return { nearest: null, axisAlignedBodyEntries: 0, eligibleBodyEntries: 0, actualBaseEntries: 0, actualBaseEligibleEntries: 0 };
  }
  const actualBaseIndexes = new Set(uniqueItemIndexes(span.baseSourceRanges));
  const evidence = bodyEntries(page, bodyFontSize)
    .map(({ item, itemIndex }) => bodyEvidence(item, itemIndex, annotation))
    .filter((entry): entry is RubyBodyNearMiss => entry !== null);
  const axisAlignedBodyEntries = evidence.filter((entry) => !entry.gates.includes("axis-mismatch") && !entry.gates.includes("body-skew")).length;
  const eligibleBodyEntries = evidence.filter((entry) => entry.gates.length === 1 && entry.gates[0] === "eligible").length;
  const actualBaseEvidence = evidence.filter((entry) => actualBaseIndexes.has(entry.itemIndex));
  const actualBaseEligibleEntries = actualBaseEvidence.filter((entry) => entry.gates.length === 1 && entry.gates[0] === "eligible").length;
  const nearest = [...evidence].sort((left, right) => left.score - right.score || left.itemIndex - right.itemIndex)[0] ?? null;
  return {
    nearest,
    axisAlignedBodyEntries,
    eligibleBodyEntries,
    actualBaseEntries: actualBaseEvidence.length,
    actualBaseEligibleEntries,
  };
}

export function fontRatioBucket(value: number | null): string {
  if (value === null) return "none";
  if (value < 0.2) return "<0.20";
  if (value < 0.35) return "0.20-<0.35";
  if (value < 0.75) return "0.35-<0.75";
  if (value < 1) return "0.75-<1.00";
  return ">=1.00";
}

export function crossDistanceBucket(value: number | null): string {
  if (value === null) return "none";
  if (value < 0) return "<0";
  if (value < 0.45) return "0-<0.45";
  if (value <= 1.35) return "0.45-1.35";
  if (value < 2) return ">1.35-<2.00";
  return ">=2.00";
}

export function inlineGapBucket(value: number | null): string {
  if (value === null) return "none";
  if (value === 0) return "overlap";
  if (value <= 0.5) return ">0-0.50";
  if (value <= 1) return ">0.50-1.00";
  return ">1.00";
}

function summarize(reports: RubyNearMissCandidate[]) {
  const reasonCounts: Record<string, number> = {};
  const unresolvedReasonCounts: Record<string, number> = {};
  const nearestGateCounts: Record<string, number> = {};
  const unresolvedNearestGateCounts: Record<string, number> = {};
  const noBaseNearestGateCounts: Record<string, number> = {};
  const noBaseFontRatioBuckets: Record<string, number> = {};
  const noBaseCrossDistanceBuckets: Record<string, number> = {};
  const noBaseInlineGapBuckets: Record<string, number> = {};
  const exactActualBaseEligibility: Record<string, number> = {};
  let exactCandidates = 0;
  let unresolvedCandidates = 0;

  for (const report of reports) {
    increment(reasonCounts, report.reason);
    const signature = report.nearest ? gateSignature(report.nearest.gates) : "no-annotation-geometry";
    increment(nearestGateCounts, signature);
    if (report.status === "exact") {
      exactCandidates += 1;
      const key = report.actualBaseEntries === 0
        ? "no-actual-base-entry"
        : report.actualBaseEligibleEntries === report.actualBaseEntries
          ? "all-actual-base-eligible"
          : report.actualBaseEligibleEntries > 0
            ? "partially-eligible"
            : "actual-base-not-eligible";
      increment(exactActualBaseEligibility, key);
    } else {
      unresolvedCandidates += 1;
      increment(unresolvedReasonCounts, report.reason);
      increment(unresolvedNearestGateCounts, signature);
      if (report.reason === "no-base") {
        increment(noBaseNearestGateCounts, signature);
        increment(noBaseFontRatioBuckets, fontRatioBucket(report.nearest?.fontRatio ?? null));
        increment(noBaseCrossDistanceBuckets, crossDistanceBucket(report.nearest?.crossDistanceRatio ?? null));
        increment(noBaseInlineGapBuckets, inlineGapBucket(report.nearest?.inlineGapRatio ?? null));
      }
    }
  }

  return {
    candidates: reports.length,
    exactCandidates,
    unresolvedCandidates,
    reasonCounts,
    unresolvedReasonCounts,
    nearestGateCounts,
    unresolvedNearestGateCounts,
    noBaseNearestGateCounts,
    noBaseFontRatioBuckets,
    noBaseCrossDistanceBuckets,
    noBaseInlineGapBuckets,
    exactActualBaseEligibility,
  };
}

export async function inspectRubyNearMissPdf(inputPath: string): Promise<PdfRubyNearMissEvidence> {
  const bytes = new Uint8Array(await readFile(inputPath));
  const sourceSha256 = sha256(bytes);
  const pdfId = `sha256:${sourceSha256.slice(0, 16)}`;
  const inspection = await inspectPdf(inputPath, { includeGlyphs: true });
  const flows = inspection.pages.map((page) => ({ page, flow: reconstructPageFlow(page) }));
  const orientations = new Map(resolveDocumentOrientations(flows.map(({ page, flow }) => ({
    page: page.page,
    orientation: flow.orientation,
  }))).map((entry) => [entry.page, entry.resolved]));
  const reports: RubyNearMissCandidate[] = [];

  for (const { page, flow } of flows) {
    const orientation = orientations.get(page.page) ?? flow.orientation;
    for (const span of associateRubySpans(page, flow.bodyFontSize)) {
      const refinement = analyzeRubyRefinementCandidate(pdfId, page, orientation, flow.bodyFontSize, span).report;
      const evidence = bestBodyEvidence(page, flow.bodyFontSize, span);
      reports.push({
        candidateId: refinement.candidateId,
        page: page.page,
        rotation: page.rotation,
        orientation,
        status: span.status,
        reason: span.reason,
        annotationSourceRanges: refinement.annotationSourceRanges,
        ...evidence,
      });
    }
  }

  const summary = summarize(reports);
  return {
    pdfId,
    sourceSha256,
    pages: inspection.pageCount,
    ...summary,
    reports,
  };
}

export function summarizeRubyNearMissCorpus(reports: PdfRubyNearMissEvidence[]): RubyNearMissCorpusEvidence {
  const reasonCounts: Record<string, number> = {};
  const unresolvedReasonCounts: Record<string, number> = {};
  const nearestGateCounts: Record<string, number> = {};
  const unresolvedNearestGateCounts: Record<string, number> = {};
  const noBaseNearestGateCounts: Record<string, number> = {};
  const noBaseFontRatioBuckets: Record<string, number> = {};
  const noBaseCrossDistanceBuckets: Record<string, number> = {};
  const noBaseInlineGapBuckets: Record<string, number> = {};
  const exactActualBaseEligibility: Record<string, number> = {};
  for (const report of reports) {
    mergeCounts(reasonCounts, report.reasonCounts);
    mergeCounts(unresolvedReasonCounts, report.unresolvedReasonCounts);
    mergeCounts(nearestGateCounts, report.nearestGateCounts);
    mergeCounts(unresolvedNearestGateCounts, report.unresolvedNearestGateCounts);
    mergeCounts(noBaseNearestGateCounts, report.noBaseNearestGateCounts);
    mergeCounts(noBaseFontRatioBuckets, report.noBaseFontRatioBuckets);
    mergeCounts(noBaseCrossDistanceBuckets, report.noBaseCrossDistanceBuckets);
    mergeCounts(noBaseInlineGapBuckets, report.noBaseInlineGapBuckets);
    mergeCounts(exactActualBaseEligibility, report.exactActualBaseEligibility);
  }
  return {
    schemaVersion: 1,
    pdfs: reports.length,
    pages: reports.reduce((sum, report) => sum + report.pages, 0),
    candidates: reports.reduce((sum, report) => sum + report.candidates, 0),
    exactCandidates: reports.reduce((sum, report) => sum + report.exactCandidates, 0),
    unresolvedCandidates: reports.reduce((sum, report) => sum + report.unresolvedCandidates, 0),
    reasonCounts,
    unresolvedReasonCounts,
    nearestGateCounts,
    unresolvedNearestGateCounts,
    noBaseNearestGateCounts,
    noBaseFontRatioBuckets,
    noBaseCrossDistanceBuckets,
    noBaseInlineGapBuckets,
    exactActualBaseEligibility,
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
    throw new Error("usage: npm run inspect:ruby-near-miss -- PDF_OR_DIRECTORY --output NEW_FILE [--expect-pdf-count N] [--expect-page-count N] [--expect-unresolved-count N]");
  }
  let output: string | undefined;
  let expectedPdfs: number | undefined;
  let expectedPages: number | undefined;
  let expectedUnresolved: number | undefined;
  while (argv.length > 0) {
    const flag = argv.shift()!;
    const value = argv.shift();
    if (flag === "--output") output = value;
    else if (flag === "--expect-pdf-count") expectedPdfs = nonNegativeInteger(value, flag);
    else if (flag === "--expect-page-count") expectedPages = nonNegativeInteger(value, flag);
    else if (flag === "--expect-unresolved-count") expectedUnresolved = nonNegativeInteger(value, flag);
    else throw new Error(`unknown option ${flag}`);
  }
  if (!output) throw new Error("--output NEW_FILE is required; ruby near-miss reports are local-only");

  const files = await pdfFiles(input);
  const reports: PdfRubyNearMissEvidence[] = [];
  for (const [index, file] of files.entries()) {
    process.stderr.write(`Ruby near-miss evidence: ${index + 1}/${files.length}\n`);
    reports.push(await inspectRubyNearMissPdf(file));
  }
  const report = summarizeRubyNearMissCorpus(reports);
  if (expectedPdfs !== undefined && report.pdfs !== expectedPdfs) throw new Error(`expected ${expectedPdfs} PDFs but found ${report.pdfs}`);
  if (expectedPages !== undefined && report.pages !== expectedPages) throw new Error(`expected ${expectedPages} pages but found ${report.pages}`);
  if (expectedUnresolved !== undefined && report.unresolvedCandidates !== expectedUnresolved) throw new Error(`expected ${expectedUnresolved} unresolved candidates but found ${report.unresolvedCandidates}`);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });

  process.stdout.write(`PDFS=${report.pdfs}\n`);
  process.stdout.write(`PAGES=${report.pages}\n`);
  process.stdout.write(`RUBY_CANDIDATES=${report.candidates}\n`);
  process.stdout.write(`EXACT_CANDIDATES=${report.exactCandidates}\n`);
  process.stdout.write(`UNRESOLVED_CANDIDATES=${report.unresolvedCandidates}\n`);
  process.stdout.write(`UNRESOLVED_REASON_COUNTS=${JSON.stringify(report.unresolvedReasonCounts)}\n`);
  process.stdout.write(`UNRESOLVED_NEAREST_GATE_COUNTS=${JSON.stringify(report.unresolvedNearestGateCounts)}\n`);
  process.stdout.write(`NO_BASE_NEAREST_GATE_COUNTS=${JSON.stringify(report.noBaseNearestGateCounts)}\n`);
  process.stdout.write(`NO_BASE_FONT_RATIO_BUCKETS=${JSON.stringify(report.noBaseFontRatioBuckets)}\n`);
  process.stdout.write(`NO_BASE_CROSS_DISTANCE_BUCKETS=${JSON.stringify(report.noBaseCrossDistanceBuckets)}\n`);
  process.stdout.write(`NO_BASE_INLINE_GAP_BUCKETS=${JSON.stringify(report.noBaseInlineGapBuckets)}\n`);
  process.stdout.write(`EXACT_ACTUAL_BASE_ELIGIBILITY=${JSON.stringify(report.exactActualBaseEligibility)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

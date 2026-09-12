import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dot } from "./display-geometry.js";
import { resolveDocumentOrientations } from "./document-orientation.js";
import { inspectPdf, type InspectPage, type InspectTextItem } from "./pdf-inspector.js";
import type { ExtractedGlyph } from "./pdfjs-glyph-adapter.js";
import { analyzeRubyRefinementCandidate } from "./ruby-refinement-inventory.js";
import { associateRubySpans, type RubySpan } from "./ruby-spans.js";
import { reconstructPageFlow } from "./text-flow.js";

type Entry = { item: InspectTextItem; index: number };
type Stage =
  | "missing-annotation-geometry"
  | "no-eligible-line"
  | "line-glyph-unmapped"
  | "no-glyph-selected"
  | "boundary-uncertainty"
  | "annotation-overhang"
  | "noncontiguous-selection"
  | "multiple-choices"
  | "unique-choice"
  | "post-selection-conflict";

type ContinuityFailure = "wide-gap" | "backtrack-overlap" | "same-item-source-gap" | "missing-source";

export type RubyUnresolvedDetail = {
  candidateId: string;
  page: number;
  status: RubySpan["status"];
  reason: RubySpan["reason"];
  replayStatus: RubySpan["status"];
  replayReason: RubySpan["reason"];
  replayMatchesProduction: boolean;
  stage: Stage;
  eligibleLineCount: number;
  selectedGlyphCount: number;
  choiceCount: number;
  continuityFailures: ContinuityFailure[];
  maxPositiveGapRatio: number | null;
  minGapRatio: number | null;
  sameItemSourceGapCount: number;
  crossItemTransitionCount: number;
  missingSourceTransitionCount: number;
  nearestBoundaryCenterRatio: number | null;
  startOverhangRatio: number | null;
  endOverhangRatio: number | null;
};

export type RubyUnresolvedDetailCorpus = {
  schemaVersion: 1;
  pdfs: number;
  pages: number;
  candidates: number;
  exactCandidates: number;
  unresolvedCandidates: number;
  replayMismatches: number;
  reasonStageCounts: Record<string, number>;
  unresolvedReasonStageCounts: Record<string, number>;
  noncontiguousFailureCounts: Record<string, number>;
  noncontiguousMaxPositiveGapBuckets: Record<string, number>;
  noncontiguousMinGapBuckets: Record<string, number>;
  ambiguousBoundaryDistanceBuckets: Record<string, number>;
  ambiguousOverhangBuckets: Record<string, number>;
  exactMaxPositiveGapBuckets: Record<string, number>;
  exactNearestBoundaryBuckets: Record<string, number>;
  reports: Array<{
    pdfId: string;
    pages: number;
    candidates: number;
    exactCandidates: number;
    unresolvedCandidates: number;
    replayMismatches: number;
    reports: RubyUnresolvedDetail[];
  }>;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

function projection(glyph: ExtractedGlyph, axis: { x: number; y: number }): number {
  return dot(glyph.geometry.start, axis);
}

function annotationEntries(page: InspectPage, span: RubySpan): Entry[] {
  const indexes = [...new Set(span.annotationSourceRanges.map((range) => range.itemIndex))];
  return indexes.map((index) => ({ item: page.textItems[index]!, index })).filter(({ item }) => item !== undefined);
}

function bodyEntries(page: InspectPage, bodyFontSize: number): Entry[] {
  return page.textItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.text.trim().length > 0 && item.fontSize >= bodyFontSize * 0.75);
}

function rounded(value: number): number {
  return Math.round(value * 100000) / 100000;
}

function uniqueFailures(values: ContinuityFailure[]): ContinuityFailure[] {
  return [...new Set(values)].sort();
}

function replayDetail(page: InspectPage, bodyFontSize: number, span: RubySpan): Omit<RubyUnresolvedDetail,
  "candidateId" | "page" | "status" | "reason" | "replayMatchesProduction"> {
  const entries = annotationEntries(page, span);
  const annotations = entries.flatMap(({ item }) => item.glyphs ?? []);
  const a = entries[0]?.item.displayGeometry;
  if (!a || entries.some(({ item }) => item.glyphMapping !== "exact" || !item.glyphs?.length || !item.displayGeometry) || Math.abs(dot(a.inline, a.side)) > 0.01) {
    return {
      replayStatus: "unresolved", replayReason: "missing-glyph-geometry", stage: "missing-annotation-geometry",
      eligibleLineCount: 0, selectedGlyphCount: 0, choiceCount: 0, continuityFailures: [],
      maxPositiveGapRatio: null, minGapRatio: null, sameItemSourceGapCount: 0, crossItemTransitionCount: 0,
      missingSourceTransitionCount: 0, nearestBoundaryCenterRatio: null, startOverhangRatio: null, endOverhangRatio: null,
    };
  }

  const start = Math.min(...annotations.map((glyph) => projection(glyph, a.inline)));
  const end = Math.max(...annotations.map((glyph) => dot(glyph.geometry.end, a.inline)));
  const lines: Array<{ cross: number; size: number; entries: Entry[] }> = [];
  for (const entry of bodyEntries(page, bodyFontSize)) {
    const b = entry.item.displayGeometry;
    if (!b || dot(b.inline, a.inline) < 0.999 || dot(b.side, a.side) < 0.999 || Math.abs(dot(b.inline, b.side)) > 0.01) continue;
    const ratio = a.crossExtent / b.crossExtent;
    if (ratio < 0.35 || ratio >= 0.75) continue;
    const cross = dot(b.start, a.side);
    const distance = dot(a.start, a.side) - cross;
    if (distance < b.crossExtent * 0.45 || distance > b.crossExtent * 1.35) continue;
    if (dot(b.end, a.inline) < start - b.crossExtent * 0.5 || dot(b.start, a.inline) > end + b.crossExtent * 0.5) continue;
    const line = lines.find((candidate) => Math.abs(candidate.cross - cross) < b.crossExtent * 0.15);
    if (line) line.entries.push(entry); else lines.push({ cross, size: b.crossExtent, entries: [entry] });
  }
  if (lines.length === 0) {
    return {
      replayStatus: "unresolved", replayReason: "no-base", stage: "no-eligible-line",
      eligibleLineCount: 0, selectedGlyphCount: 0, choiceCount: 0, continuityFailures: [],
      maxPositiveGapRatio: null, minGapRatio: null, sameItemSourceGapCount: 0, crossItemTransitionCount: 0,
      missingSourceTransitionCount: 0, nearestBoundaryCenterRatio: null, startOverhangRatio: null, endOverhangRatio: null,
    };
  }

  const choices: ExtractedGlyph[][] = [];
  let uncertain = false;
  let noncontiguous = false;
  let boundaryUncertain = false;
  let overhangUncertain = false;
  let lineGlyphUnmapped = false;
  let selectedGlyphCount = 0;
  const continuityFailures: ContinuityFailure[] = [];
  let maxPositiveGapRatio: number | null = null;
  let minGapRatio: number | null = null;
  let sameItemSourceGapCount = 0;
  let crossItemTransitionCount = 0;
  let missingSourceTransitionCount = 0;
  let nearestBoundaryCenterRatio: number | null = null;
  let startOverhangRatio: number | null = null;
  let endOverhangRatio: number | null = null;

  for (const line of lines) {
    if (line.entries.some(({ item }) => item.glyphMapping !== "exact" || !item.glyphs?.length)) {
      uncertain = true; lineGlyphUnmapped = true; continue;
    }
    const glyphs = line.entries.flatMap(({ item }) => item.glyphs!).sort((left, right) => projection(left, a.inline) - projection(right, a.inline));
    const selected = glyphs.filter((glyph) => {
      const lo = projection(glyph, a.inline);
      const hi = dot(glyph.geometry.end, a.inline);
      const overlap = Math.min(hi, end) - Math.max(lo, start);
      const center = (lo + hi) / 2;
      const tolerance = line.size * 0.01;
      if (overlap > 0) {
        const boundaryRatio = Math.min(Math.abs(center - start), Math.abs(center - end)) / line.size;
        nearestBoundaryCenterRatio = nearestBoundaryCenterRatio === null ? boundaryRatio : Math.min(nearestBoundaryCenterRatio, boundaryRatio);
      }
      if (overlap > tolerance && Math.min(Math.abs(center - start), Math.abs(center - end)) <= tolerance) {
        uncertain = true; boundaryUncertain = true;
      }
      return hi > lo && ((center > start + tolerance && center < end - tolerance) || overlap / (hi - lo) > 0.5 + 1e-6);
    });
    selectedGlyphCount += selected.length;
    if (selected.length === 0) continue;

    const lo = projection(selected[0]!, a.inline);
    const hi = dot(selected.at(-1)!.geometry.end, a.inline);
    const startOverhang = Math.max(0, lo - start) / line.size;
    const endOverhang = Math.max(0, end - hi) / line.size;
    startOverhangRatio = startOverhangRatio === null ? startOverhang : Math.max(startOverhangRatio, startOverhang);
    endOverhangRatio = endOverhangRatio === null ? endOverhang : Math.max(endOverhangRatio, endOverhang);
    if (start < lo - line.size * 0.5 || end > hi + line.size * 0.5) {
      uncertain = true; overhangUncertain = true; continue;
    }

    let continuous = true;
    for (let index = 1; index < selected.length; index += 1) {
      const previous = selected[index - 1]!;
      const current = selected[index]!;
      const gap = projection(current, a.inline) - dot(previous.geometry.end, a.inline);
      const ratio = gap / line.size;
      maxPositiveGapRatio = maxPositiveGapRatio === null ? Math.max(0, ratio) : Math.max(maxPositiveGapRatio, Math.max(0, ratio));
      minGapRatio = minGapRatio === null ? ratio : Math.min(minGapRatio, ratio);
      const left = previous.sourceRanges[0];
      const right = current.sourceRanges[0];
      if (ratio < -0.05) { uncertain = true; continuous = false; continuityFailures.push("backtrack-overlap"); }
      if (ratio > 0.5) { continuous = false; continuityFailures.push("wide-gap"); }
      if (!left || !right) {
        continuous = false; missingSourceTransitionCount += 1; continuityFailures.push("missing-source");
      } else if (left.itemIndex === right.itemIndex) {
        if (left.charEnd !== right.charStart) {
          continuous = false; sameItemSourceGapCount += 1; continuityFailures.push("same-item-source-gap");
        }
      } else {
        crossItemTransitionCount += 1;
      }
    }
    if (!continuous) { noncontiguous = true; continue; }
    choices.push(selected);
  }

  const replayReason: RubySpan["reason"] = choices.length !== 1 || uncertain || noncontiguous
    ? (uncertain || choices.length > 1 ? "ambiguous-base" : noncontiguous ? "noncontiguous-base" : "no-base")
    : "unique-contiguous-span";
  const replayStatus: RubySpan["status"] = replayReason === "unique-contiguous-span" ? "exact" : "unresolved";
  let stage: Stage;
  if (lineGlyphUnmapped) stage = "line-glyph-unmapped";
  else if (choices.length > 1) stage = "multiple-choices";
  else if (boundaryUncertain) stage = "boundary-uncertainty";
  else if (overhangUncertain) stage = "annotation-overhang";
  else if (noncontiguous) stage = "noncontiguous-selection";
  else if (choices.length === 0) stage = "no-glyph-selected";
  else stage = "unique-choice";

  return {
    replayStatus, replayReason, stage, eligibleLineCount: lines.length, selectedGlyphCount, choiceCount: choices.length,
    continuityFailures: uniqueFailures(continuityFailures),
    maxPositiveGapRatio: maxPositiveGapRatio === null ? null : rounded(maxPositiveGapRatio),
    minGapRatio: minGapRatio === null ? null : rounded(minGapRatio),
    sameItemSourceGapCount, crossItemTransitionCount, missingSourceTransitionCount,
    nearestBoundaryCenterRatio: nearestBoundaryCenterRatio === null ? null : rounded(nearestBoundaryCenterRatio),
    startOverhangRatio: startOverhangRatio === null ? null : rounded(startOverhangRatio),
    endOverhangRatio: endOverhangRatio === null ? null : rounded(endOverhangRatio),
  };
}

export function gapBucket(value: number | null): string {
  if (value === null) return "none";
  if (value <= 0.05) return "<=0.05";
  if (value <= 0.25) return ">0.05-0.25";
  if (value <= 0.5) return ">0.25-0.50";
  if (value <= 1) return ">0.50-1.00";
  return ">1.00";
}

export function minGapBucket(value: number | null): string {
  if (value === null) return "none";
  if (value < -0.5) return "<-0.50";
  if (value < -0.05) return "-0.50-<-0.05";
  if (value < 0) return "-0.05-<0";
  return ">=0";
}

export function boundaryBucket(value: number | null): string {
  if (value === null) return "none";
  if (value <= 0.0025) return "<=0.0025";
  if (value <= 0.005) return ">0.0025-0.005";
  if (value <= 0.01) return ">0.005-0.010";
  if (value <= 0.02) return ">0.010-0.020";
  return ">0.020";
}

export function overhangBucket(start: number | null, end: number | null): string {
  if (start === null && end === null) return "none";
  const value = Math.max(start ?? 0, end ?? 0);
  if (value <= 0.25) return "<=0.25";
  if (value <= 0.5) return ">0.25-0.50";
  if (value <= 0.75) return ">0.50-0.75";
  if (value <= 1) return ">0.75-1.00";
  return ">1.00";
}

async function inspectPdfDetail(inputPath: string) {
  const bytes = new Uint8Array(await readFile(inputPath));
  const pdfId = `sha256:${sha256(bytes).slice(0, 16)}`;
  const inspection = await inspectPdf(inputPath, { includeGlyphs: true });
  const flows = inspection.pages.map((page) => ({ page, flow: reconstructPageFlow(page) }));
  const orientations = new Map(resolveDocumentOrientations(flows.map(({ page, flow }) => ({ page: page.page, orientation: flow.orientation }))).map((entry) => [entry.page, entry.resolved]));
  const reports: RubyUnresolvedDetail[] = [];
  for (const { page, flow } of flows) {
    const orientation = orientations.get(page.page) ?? flow.orientation;
    for (const span of associateRubySpans(page, flow.bodyFontSize)) {
      const candidateId = analyzeRubyRefinementCandidate(pdfId, page, orientation, flow.bodyFontSize, span).report.candidateId;
      const replay = replayDetail(page, flow.bodyFontSize, span);
      const postConflict = span.reason === "conflicting-annotations" && replay.replayStatus === "exact";
      reports.push({
        candidateId, page: page.page, status: span.status, reason: span.reason, ...replay,
        ...(postConflict ? { stage: "post-selection-conflict" as const } : {}),
        replayMatchesProduction: postConflict || (replay.replayStatus === span.status && replay.replayReason === span.reason),
      });
    }
  }
  return {
    pdfId, pages: inspection.pageCount, candidates: reports.length,
    exactCandidates: reports.filter((report) => report.status === "exact").length,
    unresolvedCandidates: reports.filter((report) => report.status === "unresolved").length,
    replayMismatches: reports.filter((report) => !report.replayMatchesProduction).length,
    reports,
  };
}

export function summarizeRubyUnresolvedDetail(reports: Awaited<ReturnType<typeof inspectPdfDetail>>[]): RubyUnresolvedDetailCorpus {
  const reasonStageCounts: Record<string, number> = {};
  const unresolvedReasonStageCounts: Record<string, number> = {};
  const noncontiguousFailureCounts: Record<string, number> = {};
  const noncontiguousMaxPositiveGapBuckets: Record<string, number> = {};
  const noncontiguousMinGapBuckets: Record<string, number> = {};
  const ambiguousBoundaryDistanceBuckets: Record<string, number> = {};
  const ambiguousOverhangBuckets: Record<string, number> = {};
  const exactMaxPositiveGapBuckets: Record<string, number> = {};
  const exactNearestBoundaryBuckets: Record<string, number> = {};
  for (const pdf of reports) for (const report of pdf.reports) {
    increment(reasonStageCounts, `${report.reason}|${report.stage}`);
    if (report.status === "unresolved") increment(unresolvedReasonStageCounts, `${report.reason}|${report.stage}`);
    if (report.reason === "noncontiguous-base") {
      increment(noncontiguousFailureCounts, report.continuityFailures.length ? report.continuityFailures.join("+") : "none");
      increment(noncontiguousMaxPositiveGapBuckets, gapBucket(report.maxPositiveGapRatio));
      increment(noncontiguousMinGapBuckets, minGapBucket(report.minGapRatio));
    }
    if (report.reason === "ambiguous-base" && report.stage === "boundary-uncertainty") increment(ambiguousBoundaryDistanceBuckets, boundaryBucket(report.nearestBoundaryCenterRatio));
    if (report.reason === "ambiguous-base" && report.stage === "annotation-overhang") increment(ambiguousOverhangBuckets, overhangBucket(report.startOverhangRatio, report.endOverhangRatio));
    if (report.status === "exact") {
      increment(exactMaxPositiveGapBuckets, gapBucket(report.maxPositiveGapRatio));
      increment(exactNearestBoundaryBuckets, boundaryBucket(report.nearestBoundaryCenterRatio));
    }
  }
  return {
    schemaVersion: 1, pdfs: reports.length,
    pages: reports.reduce((sum, report) => sum + report.pages, 0),
    candidates: reports.reduce((sum, report) => sum + report.candidates, 0),
    exactCandidates: reports.reduce((sum, report) => sum + report.exactCandidates, 0),
    unresolvedCandidates: reports.reduce((sum, report) => sum + report.unresolvedCandidates, 0),
    replayMismatches: reports.reduce((sum, report) => sum + report.replayMismatches, 0),
    reasonStageCounts, unresolvedReasonStageCounts, noncontiguousFailureCounts,
    noncontiguousMaxPositiveGapBuckets, noncontiguousMinGapBuckets,
    ambiguousBoundaryDistanceBuckets, ambiguousOverhangBuckets,
    exactMaxPositiveGapBuckets, exactNearestBoundaryBuckets, reports,
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
    .map((entry) => path.join(input, entry.name)).sort();
  if (files.length === 0) throw new Error("no PDF files found");
  return files;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const input = argv.shift();
  if (!input || input.startsWith("--")) throw new Error("usage: npm run inspect:ruby-unresolved-detail -- PDF_OR_DIRECTORY --output NEW_FILE [--expect-pdf-count N] [--expect-page-count N] [--expect-unresolved-count N]");
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
  if (!output) throw new Error("--output NEW_FILE is required; unresolved-detail evidence is local-only");
  const files = await pdfFiles(input);
  const pdfReports = [];
  for (const [index, file] of files.entries()) {
    process.stderr.write(`Ruby unresolved detail: ${index + 1}/${files.length}\n`);
    pdfReports.push(await inspectPdfDetail(file));
  }
  const report = summarizeRubyUnresolvedDetail(pdfReports);
  if (expectedPdfs !== undefined && report.pdfs !== expectedPdfs) throw new Error(`expected ${expectedPdfs} PDFs but found ${report.pdfs}`);
  if (expectedPages !== undefined && report.pages !== expectedPages) throw new Error(`expected ${expectedPages} pages but found ${report.pages}`);
  if (expectedUnresolved !== undefined && report.unresolvedCandidates !== expectedUnresolved) throw new Error(`expected ${expectedUnresolved} unresolved but found ${report.unresolvedCandidates}`);
  if (report.replayMismatches !== 0) throw new Error(`unresolved-detail replay mismatched production for ${report.replayMismatches} candidates`);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write([
    `PDFS=${report.pdfs}`, `PAGES=${report.pages}`, `RUBY_CANDIDATES=${report.candidates}`,
    `EXACT_CANDIDATES=${report.exactCandidates}`, `UNRESOLVED_CANDIDATES=${report.unresolvedCandidates}`,
    `REPLAY_MISMATCHES=${report.replayMismatches}`,
    `UNRESOLVED_REASON_STAGE_COUNTS=${JSON.stringify(report.unresolvedReasonStageCounts)}`,
    `NONCONTIGUOUS_FAILURE_COUNTS=${JSON.stringify(report.noncontiguousFailureCounts)}`,
    `NONCONTIGUOUS_MAX_POSITIVE_GAP_BUCKETS=${JSON.stringify(report.noncontiguousMaxPositiveGapBuckets)}`,
    `NONCONTIGUOUS_MIN_GAP_BUCKETS=${JSON.stringify(report.noncontiguousMinGapBuckets)}`,
    `AMBIGUOUS_BOUNDARY_DISTANCE_BUCKETS=${JSON.stringify(report.ambiguousBoundaryDistanceBuckets)}`,
    `AMBIGUOUS_OVERHANG_BUCKETS=${JSON.stringify(report.ambiguousOverhangBuckets)}`,
    `EXACT_MAX_POSITIVE_GAP_BUCKETS=${JSON.stringify(report.exactMaxPositiveGapBuckets)}`,
    `EXACT_NEAREST_BOUNDARY_BUCKETS=${JSON.stringify(report.exactNearestBoundaryBuckets)}`,
  ].join("\n") + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

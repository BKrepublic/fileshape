import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dot } from "./display-geometry.js";
import { resolveDocumentOrientations } from "./document-orientation.js";
import { inspectPdf, type InspectPage, type InspectTextItem } from "./pdf-inspector.js";
import { analyzeRubyRefinementCandidate } from "./ruby-refinement-inventory.js";
import { associateRubySpans, type RubySpan } from "./ruby-spans.js";
import type { ExtractedGlyph } from "./pdfjs-glyph-adapter.js";
import { reconstructPageFlow } from "./text-flow.js";

type Entry = { item: InspectTextItem; index: number };

type ReplayReason = RubySpan["reason"];
type ReplayStatus = RubySpan["status"];

export type RubySelectionStage =
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

export type NoSelectionRelation =
  | "partial-overlap-at-most-half"
  | "between-glyphs"
  | "before-all-glyphs"
  | "after-all-glyphs"
  | "no-positive-glyph-cells"
  | "not-applicable";

export type RubyGlyphSelectionCandidate = {
  candidateId: string;
  page: number;
  status: ReplayStatus;
  reason: ReplayReason;
  replayStatus: ReplayStatus;
  replayReason: ReplayReason;
  replayMatchesProduction: boolean;
  stage: RubySelectionStage;
  eligibleLineCount: number;
  choiceCount: number;
  selectedGlyphCount: number;
  boundaryUncertain: boolean;
  overhangUncertain: boolean;
  lineGlyphUnmapped: boolean;
  noncontiguous: boolean;
  noSelectionRelation: NoSelectionRelation;
  maxGlyphOverlapRatio: number | null;
};

export type RubyGlyphSelectionCorpus = {
  schemaVersion: 1;
  pdfs: number;
  pages: number;
  candidates: number;
  exactCandidates: number;
  unresolvedCandidates: number;
  replayMismatches: number;
  stageCounts: Record<string, number>;
  unresolvedStageCounts: Record<string, number>;
  noBaseStageCounts: Record<string, number>;
  noBaseEligibleLineCount: number;
  noBaseNoSelectionRelationCounts: Record<string, number>;
  noBaseMaxOverlapBuckets: Record<string, number>;
  reports: Array<{
    pdfId: string;
    pages: number;
    candidates: number;
    exactCandidates: number;
    unresolvedCandidates: number;
    replayMismatches: number;
    reports: RubyGlyphSelectionCandidate[];
  }>;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount;
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, count] of Object.entries(source)) increment(target, key, count);
}

function projection(glyph: ExtractedGlyph, axis: { x: number; y: number }): number {
  return dot(glyph.geometry.start, axis);
}

function annotationEntries(page: InspectPage, span: RubySpan): Entry[] {
  const indexes = [...new Set(span.annotationSourceRanges.map((range) => range.itemIndex))];
  return indexes
    .map((index) => ({ item: page.textItems[index]!, index }))
    .filter(({ item }) => item !== undefined);
}

function bodyEntries(page: InspectPage, bodyFontSize: number): Entry[] {
  return page.textItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.text.trim().length > 0 && item.fontSize >= bodyFontSize * 0.75);
}

export function classifyNoSelectionGeometry(
  intervals: Array<{ lo: number; hi: number }>,
  annotationStart: number,
  annotationEnd: number,
): { relation: NoSelectionRelation; maxOverlapRatio: number | null } {
  const valid = intervals.filter(({ lo, hi }) => Number.isFinite(lo) && Number.isFinite(hi) && hi > lo);
  if (valid.length === 0) return { relation: "no-positive-glyph-cells", maxOverlapRatio: null };
  const ordered = [...valid].sort((left, right) => left.lo - right.lo || left.hi - right.hi);
  let maxOverlapRatio = 0;
  for (const { lo, hi } of ordered) {
    const overlap = Math.max(0, Math.min(hi, annotationEnd) - Math.max(lo, annotationStart));
    maxOverlapRatio = Math.max(maxOverlapRatio, overlap / (hi - lo));
  }
  if (maxOverlapRatio > 0) {
    return { relation: "partial-overlap-at-most-half", maxOverlapRatio };
  }
  const first = ordered[0]!;
  const last = ordered.at(-1)!;
  if (annotationEnd <= first.lo) return { relation: "before-all-glyphs", maxOverlapRatio: 0 };
  if (annotationStart >= last.hi) return { relation: "after-all-glyphs", maxOverlapRatio: 0 };
  return { relation: "between-glyphs", maxOverlapRatio: 0 };
}

type ReplayLine = {
  cross: number;
  size: number;
  entries: Entry[];
};

function replaySelection(page: InspectPage, bodyFontSize: number, span: RubySpan): Omit<RubyGlyphSelectionCandidate,
  "candidateId" | "page" | "status" | "reason" | "replayMatchesProduction"> {
  const annotationsEntries = annotationEntries(page, span);
  const annotations = annotationsEntries.flatMap(({ item }) => item.glyphs ?? []);
  const firstGeometry = annotationsEntries[0]?.item.displayGeometry;
  if (
    !firstGeometry ||
    annotationsEntries.some(({ item }) => item.glyphMapping !== "exact" || !item.glyphs?.length || !item.displayGeometry)
  ) {
    return {
      replayStatus: "unresolved",
      replayReason: "missing-glyph-geometry",
      stage: "missing-annotation-geometry",
      eligibleLineCount: 0,
      choiceCount: 0,
      selectedGlyphCount: 0,
      boundaryUncertain: false,
      overhangUncertain: false,
      lineGlyphUnmapped: false,
      noncontiguous: false,
      noSelectionRelation: "not-applicable",
      maxGlyphOverlapRatio: null,
    };
  }

  const a = firstGeometry;
  if (Math.abs(dot(a.inline, a.side)) > 0.01) {
    return {
      replayStatus: "unresolved",
      replayReason: "missing-glyph-geometry",
      stage: "missing-annotation-geometry",
      eligibleLineCount: 0,
      choiceCount: 0,
      selectedGlyphCount: 0,
      boundaryUncertain: false,
      overhangUncertain: false,
      lineGlyphUnmapped: false,
      noncontiguous: false,
      noSelectionRelation: "not-applicable",
      maxGlyphOverlapRatio: null,
    };
  }

  const start = Math.min(...annotations.map((glyph) => projection(glyph, a.inline)));
  const end = Math.max(...annotations.map((glyph) => dot(glyph.geometry.end, a.inline)));
  const lines: ReplayLine[] = [];

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
    if (line) line.entries.push(entry);
    else lines.push({ cross, size: b.crossExtent, entries: [entry] });
  }

  if (lines.length === 0) {
    return {
      replayStatus: "unresolved",
      replayReason: "no-base",
      stage: "no-eligible-line",
      eligibleLineCount: 0,
      choiceCount: 0,
      selectedGlyphCount: 0,
      boundaryUncertain: false,
      overhangUncertain: false,
      lineGlyphUnmapped: false,
      noncontiguous: false,
      noSelectionRelation: "not-applicable",
      maxGlyphOverlapRatio: null,
    };
  }

  const choices: ExtractedGlyph[][] = [];
  let uncertain = false;
  let noncontiguous = false;
  let boundaryUncertain = false;
  let overhangUncertain = false;
  let lineGlyphUnmapped = false;
  let selectedGlyphCount = 0;
  const noSelection: Array<{ relation: NoSelectionRelation; maxOverlapRatio: number | null }> = [];

  for (const line of lines) {
    if (line.entries.some(({ item }) => item.glyphMapping !== "exact" || !item.glyphs?.length)) {
      uncertain = true;
      lineGlyphUnmapped = true;
      continue;
    }
    const glyphs = line.entries
      .flatMap(({ item }) => item.glyphs!)
      .sort((left, right) => projection(left, a.inline) - projection(right, a.inline));
    const selected = glyphs.filter((glyph) => {
      const lo = projection(glyph, a.inline);
      const hi = dot(glyph.geometry.end, a.inline);
      const overlap = Math.min(hi, end) - Math.max(lo, start);
      const center = (lo + hi) / 2;
      const tolerance = line.size * 0.01;
      if (overlap > tolerance && Math.min(Math.abs(center - start), Math.abs(center - end)) <= tolerance) {
        uncertain = true;
        boundaryUncertain = true;
      }
      return hi > lo && ((center > start + tolerance && center < end - tolerance) || overlap / (hi - lo) > 0.5 + 1e-6);
    });
    selectedGlyphCount += selected.length;
    if (selected.length === 0) {
      noSelection.push(classifyNoSelectionGeometry(
        glyphs.map((glyph) => ({ lo: projection(glyph, a.inline), hi: dot(glyph.geometry.end, a.inline) })),
        start,
        end,
      ));
      continue;
    }

    const lo = projection(selected[0]!, a.inline);
    const hi = dot(selected.at(-1)!.geometry.end, a.inline);
    if (start < lo - line.size * 0.5 || end > hi + line.size * 0.5) {
      uncertain = true;
      overhangUncertain = true;
      continue;
    }

    let continuous = true;
    for (let index = 1; index < selected.length; index += 1) {
      const previous = selected[index - 1]!;
      const current = selected[index]!;
      const gap = projection(current, a.inline) - dot(previous.geometry.end, a.inline);
      const left = previous.sourceRanges[0];
      const right = current.sourceRanges[0];
      if (gap < -line.size * 0.05) {
        uncertain = true;
        continuous = false;
      }
      if (
        gap > line.size * 0.5 ||
        !left || !right ||
        (left.itemIndex === right.itemIndex && left.charEnd !== right.charStart)
      ) {
        continuous = false;
      }
    }
    if (!continuous) {
      noncontiguous = true;
      continue;
    }
    choices.push(selected);
  }

  const replayReason: ReplayReason = choices.length !== 1 || uncertain || noncontiguous
    ? (uncertain || choices.length > 1 ? "ambiguous-base" : noncontiguous ? "noncontiguous-base" : "no-base")
    : "unique-contiguous-span";
  const replayStatus: ReplayStatus = replayReason === "unique-contiguous-span" ? "exact" : "unresolved";

  let stage: RubySelectionStage;
  if (lineGlyphUnmapped) stage = "line-glyph-unmapped";
  else if (choices.length > 1) stage = "multiple-choices";
  else if (boundaryUncertain) stage = "boundary-uncertainty";
  else if (overhangUncertain) stage = "annotation-overhang";
  else if (noncontiguous) stage = "noncontiguous-selection";
  else if (choices.length === 0) stage = "no-glyph-selected";
  else stage = "unique-choice";

  const bestNoSelection = [...noSelection].sort((left, right) =>
    (right.maxOverlapRatio ?? -1) - (left.maxOverlapRatio ?? -1))[0];

  return {
    replayStatus,
    replayReason,
    stage,
    eligibleLineCount: lines.length,
    choiceCount: choices.length,
    selectedGlyphCount,
    boundaryUncertain,
    overhangUncertain,
    lineGlyphUnmapped,
    noncontiguous,
    noSelectionRelation: bestNoSelection?.relation ?? "not-applicable",
    maxGlyphOverlapRatio: bestNoSelection?.maxOverlapRatio ?? null,
  };
}

function overlapBucket(value: number | null): string {
  if (value === null) return "none";
  if (value === 0) return "0";
  if (value <= 0.1) return ">0-0.10";
  if (value <= 0.25) return ">0.10-0.25";
  if (value <= 0.5 + 1e-6) return ">0.25-0.50";
  return ">0.50";
}

async function inspectPdfSelection(inputPath: string) {
  const bytes = new Uint8Array(await readFile(inputPath));
  const pdfId = `sha256:${sha256(bytes).slice(0, 16)}`;
  const inspection = await inspectPdf(inputPath, { includeGlyphs: true });
  const flows = inspection.pages.map((page) => ({ page, flow: reconstructPageFlow(page) }));
  const orientations = new Map(resolveDocumentOrientations(flows.map(({ page, flow }) => ({
    page: page.page,
    orientation: flow.orientation,
  }))).map((entry) => [entry.page, entry.resolved]));
  const reports: RubyGlyphSelectionCandidate[] = [];

  for (const { page, flow } of flows) {
    const orientation = orientations.get(page.page) ?? flow.orientation;
    for (const span of associateRubySpans(page, flow.bodyFontSize)) {
      const candidateId = analyzeRubyRefinementCandidate(pdfId, page, orientation, flow.bodyFontSize, span).report.candidateId;
      const replay = replaySelection(page, flow.bodyFontSize, span);
      const postConflict = span.reason === "conflicting-annotations" && replay.replayStatus === "exact";
      reports.push({
        candidateId,
        page: page.page,
        status: span.status,
        reason: span.reason,
        ...replay,
        ...(postConflict ? { stage: "post-selection-conflict" as const } : {}),
        replayMatchesProduction: postConflict || (replay.replayStatus === span.status && replay.replayReason === span.reason),
      });
    }
  }

  return {
    pdfId,
    pages: inspection.pageCount,
    candidates: reports.length,
    exactCandidates: reports.filter((report) => report.status === "exact").length,
    unresolvedCandidates: reports.filter((report) => report.status === "unresolved").length,
    replayMismatches: reports.filter((report) => !report.replayMatchesProduction).length,
    reports,
  };
}

export function summarizeRubyGlyphSelection(reports: Awaited<ReturnType<typeof inspectPdfSelection>>[]): RubyGlyphSelectionCorpus {
  const stageCounts: Record<string, number> = {};
  const unresolvedStageCounts: Record<string, number> = {};
  const noBaseStageCounts: Record<string, number> = {};
  const noBaseNoSelectionRelationCounts: Record<string, number> = {};
  const noBaseMaxOverlapBuckets: Record<string, number> = {};
  let noBaseEligibleLineCount = 0;

  for (const pdf of reports) {
    for (const report of pdf.reports) {
      increment(stageCounts, report.stage);
      if (report.status === "unresolved") increment(unresolvedStageCounts, report.stage);
      if (report.reason === "no-base") {
        increment(noBaseStageCounts, report.stage);
        if (report.eligibleLineCount > 0) noBaseEligibleLineCount += 1;
        increment(noBaseNoSelectionRelationCounts, report.noSelectionRelation);
        increment(noBaseMaxOverlapBuckets, overlapBucket(report.maxGlyphOverlapRatio));
      }
    }
  }

  return {
    schemaVersion: 1,
    pdfs: reports.length,
    pages: reports.reduce((sum, report) => sum + report.pages, 0),
    candidates: reports.reduce((sum, report) => sum + report.candidates, 0),
    exactCandidates: reports.reduce((sum, report) => sum + report.exactCandidates, 0),
    unresolvedCandidates: reports.reduce((sum, report) => sum + report.unresolvedCandidates, 0),
    replayMismatches: reports.reduce((sum, report) => sum + report.replayMismatches, 0),
    stageCounts,
    unresolvedStageCounts,
    noBaseStageCounts,
    noBaseEligibleLineCount,
    noBaseNoSelectionRelationCounts,
    noBaseMaxOverlapBuckets,
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
    throw new Error("usage: npm run inspect:ruby-glyph-selection -- PDF_OR_DIRECTORY --output NEW_FILE [--expect-pdf-count N] [--expect-page-count N] [--expect-unresolved-count N] [--expect-no-base-eligible-line-count N]");
  }
  let output: string | undefined;
  let expectedPdfs: number | undefined;
  let expectedPages: number | undefined;
  let expectedUnresolved: number | undefined;
  let expectedNoBaseEligibleLines: number | undefined;
  while (argv.length > 0) {
    const flag = argv.shift()!;
    const value = argv.shift();
    if (flag === "--output") output = value;
    else if (flag === "--expect-pdf-count") expectedPdfs = nonNegativeInteger(value, flag);
    else if (flag === "--expect-page-count") expectedPages = nonNegativeInteger(value, flag);
    else if (flag === "--expect-unresolved-count") expectedUnresolved = nonNegativeInteger(value, flag);
    else if (flag === "--expect-no-base-eligible-line-count") expectedNoBaseEligibleLines = nonNegativeInteger(value, flag);
    else throw new Error(`unknown option ${flag}`);
  }
  if (!output) throw new Error("--output NEW_FILE is required; glyph-selection evidence is local-only");

  const files = await pdfFiles(input);
  const pdfReports = [];
  for (const [index, file] of files.entries()) {
    process.stderr.write(`Ruby glyph-selection replay: ${index + 1}/${files.length}\n`);
    pdfReports.push(await inspectPdfSelection(file));
  }
  const report = summarizeRubyGlyphSelection(pdfReports);
  if (expectedPdfs !== undefined && report.pdfs !== expectedPdfs) throw new Error(`expected ${expectedPdfs} PDFs but found ${report.pdfs}`);
  if (expectedPages !== undefined && report.pages !== expectedPages) throw new Error(`expected ${expectedPages} pages but found ${report.pages}`);
  if (expectedUnresolved !== undefined && report.unresolvedCandidates !== expectedUnresolved) throw new Error(`expected ${expectedUnresolved} unresolved but found ${report.unresolvedCandidates}`);
  if (expectedNoBaseEligibleLines !== undefined && report.noBaseEligibleLineCount !== expectedNoBaseEligibleLines) {
    throw new Error(`expected ${expectedNoBaseEligibleLines} no-base candidates with eligible lines but found ${report.noBaseEligibleLineCount}`);
  }
  if (report.replayMismatches !== 0) throw new Error(`glyph-selection replay mismatched production for ${report.replayMismatches} candidates`);

  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write([
    `PDFS=${report.pdfs}`,
    `PAGES=${report.pages}`,
    `RUBY_CANDIDATES=${report.candidates}`,
    `EXACT_CANDIDATES=${report.exactCandidates}`,
    `UNRESOLVED_CANDIDATES=${report.unresolvedCandidates}`,
    `REPLAY_MISMATCHES=${report.replayMismatches}`,
    `SELECTION_STAGE_COUNTS=${JSON.stringify(report.stageCounts)}`,
    `UNRESOLVED_STAGE_COUNTS=${JSON.stringify(report.unresolvedStageCounts)}`,
    `NO_BASE_STAGE_COUNTS=${JSON.stringify(report.noBaseStageCounts)}`,
    `NO_BASE_ELIGIBLE_LINE_COUNT=${report.noBaseEligibleLineCount}`,
    `NO_BASE_NO_SELECTION_RELATION_COUNTS=${JSON.stringify(report.noBaseNoSelectionRelationCounts)}`,
    `NO_BASE_MAX_OVERLAP_BUCKETS=${JSON.stringify(report.noBaseMaxOverlapBuckets)}`,
  ].join("\n") + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

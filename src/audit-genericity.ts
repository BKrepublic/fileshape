import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { attachedRunTendency } from "./attached-run-evidence.js";
import { resolveDocumentOrientations } from "./document-orientation.js";
import type { SourceOutlineItem } from "./document-navigation.js";
import { summarizeOrientationEvidence } from "./orientation-evidence.js";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPageFlow, type PageFlowResult, type WritingOrientation } from "./text-flow.js";

const SAMPLE_DIRECTORY = process.env.FILESHAPE_PRIVATE_CORPUS_DIR ?? "local-samples";
const EXPECTED_PDF_COUNT = 9;
const RULE = "=".repeat(88);
const DIAGNOSTIC_WEAK_MARGIN = 0.2;
const MAX_SUSPICIOUS_PAGES = 12;
const DETAILED = process.env.FILESHAPE_AUDIT_DETAILS === "1";

type OrientationCounts = Record<WritingOrientation, number>;

type PageAudit = {
  page: number;
  detected: WritingOrientation;
  resolved: WritingOrientation;
  resolutionSource: string;
  edge: "start" | "end" | "none";
  attachedTendency: WritingOrientation;
  bodyFontSize: number;
  primaryItems: number;
  annotationItems: number;
  marginNoiseItems: number;
  evidenceVertical: number;
  evidenceHorizontal: number;
  evidenceMargin: number;
  metrics: PageFlowResult["metrics"];
};

type FileAudit = {
  file: string;
  pages: number;
  outlineTotal: number;
  outlineResolved: number;
  detected: OrientationCounts;
  resolved: OrientationCounts;
  contextResolved: number;
  contextFilledUnknown: number;
  contextRepairedKnown: number;
  repairedKnownPages: PageAudit[];
  unknownPages: PageAudit[];
  isolatedKnownFlips: number[];
  weakKnownPages: PageAudit[];
  bodyFontQ10: number;
  bodyFontQ50: number;
  bodyFontQ90: number;
  evidenceMarginQ10: number;
  evidenceMarginQ50: number;
  evidenceMarginQ90: number;
  annotationFractionQ50: number;
  annotationFractionQ90: number;
  pagesWithMarginNoise: number;
  suspicious: PageAudit[];
};

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const position = (ordered.length - 1) * q;
  const lo = Math.floor(position);
  const hi = Math.ceil(position);
  const left = ordered[lo] ?? 0;
  const right = ordered[hi] ?? left;
  if (lo === hi) return left;
  return left + (right - left) * (position - lo);
}

function emptyCounts(): OrientationCounts {
  return { vertical: 0, horizontal: 0, unknown: 0 };
}

function countOrientation(values: WritingOrientation[]): OrientationCounts {
  const counts = emptyCounts();
  for (const value of values) counts[value] += 1;
  return counts;
}

function outlineCounts(items: SourceOutlineItem[] | undefined): { total: number; resolved: number } {
  let total = 0;
  let resolved = 0;
  const visit = (entries: SourceOutlineItem[]): void => {
    for (const entry of entries) {
      total += 1;
      if (entry.target.status === "resolved") resolved += 1;
      visit(entry.items);
    }
  };
  visit(items ?? []);
  return { total, resolved };
}

function isolatedKnownFlips(pages: PageAudit[]): number[] {
  const flips: number[] = [];
  for (let index = 1; index + 1 < pages.length; index += 1) {
    const previous = pages[index - 1]!;
    const current = pages[index]!;
    const next = pages[index + 1]!;
    if (previous.detected === "unknown" || current.detected === "unknown" || next.detected === "unknown") continue;
    if (previous.detected === next.detected && current.detected !== previous.detected) flips.push(current.page);
  }
  return flips;
}

function pageLabel(page: PageAudit): string {
  const m = page.metrics;
  return [
    `p${page.page}`,
    `${page.detected}->${page.resolved}`,
    `source=${page.resolutionSource}`,
    `edge=${page.edge}`,
    `attached=${page.attachedTendency}`,
    `margin=${page.evidenceMargin.toFixed(3)}`,
    `V/H=${page.evidenceVertical.toFixed(3)}/${page.evidenceHorizontal.toFixed(3)}`,
    `run=${m.verticalRunRatio.toFixed(2)}/${m.horizontalRunRatio.toFixed(2)}`,
    `base=${m.verticalBaselineRatio.toFixed(2)}/${m.horizontalBaselineRatio.toFixed(2)}`,
    `seq=${m.sequenceVerticalRatio.toFixed(2)}/${m.sequenceHorizontalRatio.toFixed(2)}`,
    `single=${m.singleCharItemRatio.toFixed(2)}`,
    `font=${page.bodyFontSize.toFixed(2)}`,
  ].join(" ");
}

async function auditFile(filePath: string): Promise<FileAudit> {
  const inspection = await inspectPdf(filePath);
  const flows = inspection.pages.map((page) => ({ page: page.page, flow: reconstructPageFlow(page) }));
  const orientationResolution = resolveDocumentOrientations(
    flows.map(({ page, flow }) => ({
      page,
      orientation: flow.orientation,
      evidence: summarizeOrientationEvidence(
        flow.orientation,
        flow.metrics,
        flow.attachedRunEvidence,
      ),
    })),
  );
  const resolvedByPage = new Map(orientationResolution.map((entry) => [entry.page, entry]));

  const pages: PageAudit[] = flows.map(({ page, flow }) => {
    const evidence = summarizeOrientationEvidence(
      flow.orientation,
      flow.metrics,
      flow.attachedRunEvidence,
    );
    const resolved = resolvedByPage.get(page);
    return {
      page,
      detected: flow.orientation,
      resolved: resolved?.resolved ?? flow.orientation,
      resolutionSource: resolved?.source ?? "missing",
      edge: page === 1 ? "start" : page === inspection.pageCount ? "end" : "none",
      attachedTendency: evidence.attachedRun === undefined
        ? "unknown"
        : attachedRunTendency(evidence.attachedRun),
      bodyFontSize: flow.bodyFontSize,
      primaryItems: flow.primaryItemCount,
      annotationItems: flow.annotationItemCount,
      marginNoiseItems: flow.marginNoiseItemCount,
      evidenceVertical: evidence.vertical,
      evidenceHorizontal: evidence.horizontal,
      evidenceMargin: evidence.margin,
      metrics: flow.metrics,
    };
  });

  const unknownPages = pages
    .filter((page) => page.detected === "unknown")
    .sort((a, b) => a.page - b.page);
  const weakKnownPages = pages
    .filter((page) => page.detected !== "unknown" && page.evidenceMargin < DIAGNOSTIC_WEAK_MARGIN)
    .sort((a, b) => a.evidenceMargin - b.evidenceMargin || a.page - b.page);
  const repairedKnownPages = pages
    .filter((page) => page.detected !== "unknown" && page.resolved !== page.detected)
    .sort((a, b) => a.page - b.page);
  const flips = isolatedKnownFlips(pages);
  const flipSet = new Set(flips);
  const repairedKnownSet = new Set(repairedKnownPages.map((page) => page.page));
  const suspicious = [...pages]
    .filter((page) => flipSet.has(page.page) || repairedKnownSet.has(page.page) || weakKnownPages.includes(page))
    .sort((a, b) =>
      Number(repairedKnownSet.has(b.page)) - Number(repairedKnownSet.has(a.page))
      || Number(flipSet.has(b.page)) - Number(flipSet.has(a.page))
      || a.evidenceMargin - b.evidenceMargin
      || a.page - b.page)
    .slice(0, MAX_SUSPICIOUS_PAGES);

  const bodyFonts = pages.map((page) => page.bodyFontSize).filter((value) => value > 0);
  const margins = pages.map((page) => page.evidenceMargin);
  const annotationFractions = pages.map((page) => {
    const denominator = page.primaryItems + page.annotationItems;
    return denominator === 0 ? 0 : page.annotationItems / denominator;
  });
  const outlines = outlineCounts(inspection.outline);
  const contextPages = pages.filter((page) => page.resolutionSource === "document-context");

  return {
    file: path.basename(filePath),
    pages: inspection.pageCount,
    outlineTotal: outlines.total,
    outlineResolved: outlines.resolved,
    detected: countOrientation(pages.map((page) => page.detected)),
    resolved: countOrientation(pages.map((page) => page.resolved)),
    contextResolved: contextPages.length,
    contextFilledUnknown: contextPages.filter((page) => page.detected === "unknown").length,
    contextRepairedKnown: repairedKnownPages.length,
    repairedKnownPages,
    unknownPages,
    isolatedKnownFlips: flips,
    weakKnownPages,
    bodyFontQ10: round(quantile(bodyFonts, 0.1), 2),
    bodyFontQ50: round(quantile(bodyFonts, 0.5), 2),
    bodyFontQ90: round(quantile(bodyFonts, 0.9), 2),
    evidenceMarginQ10: round(quantile(margins, 0.1), 3),
    evidenceMarginQ50: round(quantile(margins, 0.5), 3),
    evidenceMarginQ90: round(quantile(margins, 0.9), 3),
    annotationFractionQ50: round(quantile(annotationFractions, 0.5), 3),
    annotationFractionQ90: round(quantile(annotationFractions, 0.9), 3),
    pagesWithMarginNoise: pages.filter((page) => page.marginNoiseItems > 0).length,
    suspicious,
  };
}

function printSummary(result: FileAudit): void {
  const d = result.detected;
  const r = result.resolved;
  const repaired = result.repairedKnownPages.length > 0
    ? ` repairedPages=${result.repairedKnownPages.map((page) => page.page).join(",")}`
    : "";
  console.log(
    `FILE=${result.file} pages=${result.pages}`
    + ` detected=${d.vertical}/${d.horizontal}/${d.unknown}`
    + ` resolved=${r.vertical}/${r.horizontal}/${r.unknown}`
    + ` unknownFilled=${result.contextFilledUnknown}`
    + ` knownRepaired=${result.contextRepairedKnown}`
    + repaired,
  );
}

function printAudit(result: FileAudit): void {
  const d = result.detected;
  const r = result.resolved;
  console.log(`FILE=${result.file}`);
  console.log(`  pages=${result.pages} outline=${result.outlineResolved}/${result.outlineTotal}`);
  console.log(`  detected V/H/U=${d.vertical}/${d.horizontal}/${d.unknown} resolved V/H/U=${r.vertical}/${r.horizontal}/${r.unknown}`);
  console.log(`  contextResolved=${result.contextResolved} unknownFilled=${result.contextFilledUnknown} knownRepaired=${result.contextRepairedKnown}`);
  console.log(`  isolatedKnownFlips=${result.isolatedKnownFlips.length}${result.isolatedKnownFlips.length ? ` pages=${result.isolatedKnownFlips.slice(0, 20).join(",")}` : ""}`);
  console.log(`  weakKnown(margin<${DIAGNOSTIC_WEAK_MARGIN})=${result.weakKnownPages.length}`);
  if (result.unknownPages.length > 0) {
    for (const page of result.unknownPages) console.log(`  UNKNOWN ${pageLabel(page)}`);
  }
  if (result.repairedKnownPages.length > 0) {
    console.log(`  repairedKnownPages=${result.repairedKnownPages.map((page) => page.page).join(",")}`);
  }
  console.log(`  bodyFont q10/q50/q90=${result.bodyFontQ10}/${result.bodyFontQ50}/${result.bodyFontQ90}`);
  console.log(`  evidenceMargin q10/q50/q90=${result.evidenceMarginQ10}/${result.evidenceMarginQ50}/${result.evidenceMarginQ90}`);
  console.log(`  annotationFraction q50/q90=${result.annotationFractionQ50}/${result.annotationFractionQ90} pagesWithMarginNoise=${result.pagesWithMarginNoise}`);
  for (const page of result.suspicious) console.log(`  SUSPECT ${pageLabel(page)}`);
}

async function main(): Promise<void> {
  const names = readdirSync(SAMPLE_DIRECTORY)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();

  if (names.length !== EXPECTED_PDF_COUNT) {
    console.error(`Expected ${EXPECTED_PDF_COUNT} PDFs in ${SAMPLE_DIRECTORY}, found ${names.length}`);
    process.exitCode = 1;
    return;
  }

  const results: FileAudit[] = [];
  for (const [index, name] of names.entries()) {
    console.log(`[${index + 1}/${names.length}] audit ${name}`);
    results.push(await auditFile(path.join(SAMPLE_DIRECTORY, name)));
  }

  console.log("");
  console.log(RULE);
  console.log("FILESHAPE GENERICITY AUDIT");
  console.log(DETAILED
    ? "Detailed diagnostic evidence. No value below is a production rule."
    : "Concise resolver-impact summary. Set FILESHAPE_AUDIT_DETAILS=1 for diagnostics.");
  console.log(RULE);
  for (const result of results) {
    if (DETAILED) printAudit(result);
    else printSummary(result);
  }

  const totalPages = results.reduce((sum, result) => sum + result.pages, 0);
  const totalFlips = results.reduce((sum, result) => sum + result.isolatedKnownFlips.length, 0);
  const totalWeak = results.reduce((sum, result) => sum + result.weakKnownPages.length, 0);
  const totalUnknownFilled = results.reduce((sum, result) => sum + result.contextFilledUnknown, 0);
  const totalKnownRepaired = results.reduce((sum, result) => sum + result.contextRepairedKnown, 0);
  const totalDetectedUnknown = results.reduce((sum, result) => sum + result.detected.unknown, 0);
  const totalResolvedUnknown = results.reduce((sum, result) => sum + result.resolved.unknown, 0);

  console.log(RULE);
  console.log(
    `TOTAL pdfs=${results.length} pages=${totalPages}`
    + ` unknown=${totalDetectedUnknown}->${totalResolvedUnknown}`
    + ` unknownFilled=${totalUnknownFilled}`
    + ` knownRepaired=${totalKnownRepaired}`,
  );
  if (DETAILED) {
    console.log(`DETAIL isolatedKnownFlips=${totalFlips} weakKnownDiagnostic=${totalWeak}`);
    console.log("Diagnostic weak-margin counts are cross-channel signals only; do not use them as production confidence.");
  }
  console.log(RULE);
}

await main();

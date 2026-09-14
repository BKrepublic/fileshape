import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolveDocumentOrientations } from "./document-orientation.js";
import type { SourceOutlineItem } from "./document-navigation.js";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPageFlow, type PageFlowResult, type WritingOrientation } from "./text-flow.js";

const SAMPLE_DIRECTORY = process.env.FILESHAPE_PRIVATE_CORPUS_DIR ?? "local-samples";
const EXPECTED_PDF_COUNT = 9;
const RULE = "=".repeat(88);
const DIAGNOSTIC_WEAK_MARGIN = 0.2;
const MAX_SUSPICIOUS_PAGES = 12;

type OrientationCounts = Record<WritingOrientation, number>;

type PageAudit = {
  page: number;
  detected: WritingOrientation;
  resolved: WritingOrientation;
  resolutionSource: string;
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

function orientationEvidence(flow: PageFlowResult): { vertical: number; horizontal: number; margin: number } {
  const m = flow.metrics;
  // Diagnostic only. Preserve the individual production metrics and summarize
  // how strongly they disagree. This score must not become a production rule.
  const vertical = Math.max(m.verticalRunRatio, m.verticalBaselineRatio, m.sequenceVerticalRatio);
  const horizontal = Math.max(m.horizontalRunRatio, m.horizontalBaselineRatio, m.sequenceHorizontalRatio);
  return {
    vertical: round(vertical, 4),
    horizontal: round(horizontal, 4),
    margin: round(Math.abs(vertical - horizontal), 4),
  };
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
    flows.map(({ page, flow }) => ({ page, orientation: flow.orientation })),
  );
  const resolvedByPage = new Map(orientationResolution.map((entry) => [entry.page, entry]));

  const pages: PageAudit[] = flows.map(({ page, flow }) => {
    const evidence = orientationEvidence(flow);
    const resolved = resolvedByPage.get(page);
    return {
      page,
      detected: flow.orientation,
      resolved: resolved?.resolved ?? flow.orientation,
      resolutionSource: resolved?.source ?? "missing",
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

  const weakKnownPages = pages
    .filter((page) => page.detected !== "unknown" && page.evidenceMargin < DIAGNOSTIC_WEAK_MARGIN)
    .sort((a, b) => a.evidenceMargin - b.evidenceMargin || a.page - b.page);
  const flips = isolatedKnownFlips(pages);
  const flipSet = new Set(flips);
  const suspicious = [...pages]
    .filter((page) => flipSet.has(page.page) || weakKnownPages.includes(page))
    .sort((a, b) => Number(flipSet.has(b.page)) - Number(flipSet.has(a.page)) || a.evidenceMargin - b.evidenceMargin || a.page - b.page)
    .slice(0, MAX_SUSPICIOUS_PAGES);

  const bodyFonts = pages.map((page) => page.bodyFontSize).filter((value) => value > 0);
  const margins = pages.map((page) => page.evidenceMargin);
  const annotationFractions = pages.map((page) => {
    const denominator = page.primaryItems + page.annotationItems;
    return denominator === 0 ? 0 : page.annotationItems / denominator;
  });
  const outlines = outlineCounts(inspection.outline);

  return {
    file: path.basename(filePath),
    pages: inspection.pageCount,
    outlineTotal: outlines.total,
    outlineResolved: outlines.resolved,
    detected: countOrientation(pages.map((page) => page.detected)),
    resolved: countOrientation(pages.map((page) => page.resolved)),
    contextResolved: pages.filter((page) => page.resolutionSource === "document-context").length,
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

function printAudit(result: FileAudit): void {
  const d = result.detected;
  const r = result.resolved;
  console.log(`FILE=${result.file}`);
  console.log(`  pages=${result.pages} outline=${result.outlineResolved}/${result.outlineTotal}`);
  console.log(`  detected V/H/U=${d.vertical}/${d.horizontal}/${d.unknown} resolved V/H/U=${r.vertical}/${r.horizontal}/${r.unknown} contextFilled=${result.contextResolved}`);
  console.log(`  isolatedKnownFlips=${result.isolatedKnownFlips.length}${result.isolatedKnownFlips.length ? ` pages=${result.isolatedKnownFlips.slice(0, 20).join(",")}` : ""}`);
  console.log(`  weakKnown(margin<${DIAGNOSTIC_WEAK_MARGIN})=${result.weakKnownPages.length}`);
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
  console.log("Diagnostic evidence only. No sample-specific value below is a production rule.");
  console.log(RULE);
  for (const result of results) printAudit(result);

  const totalPages = results.reduce((sum, result) => sum + result.pages, 0);
  const totalFlips = results.reduce((sum, result) => sum + result.isolatedKnownFlips.length, 0);
  const totalWeak = results.reduce((sum, result) => sum + result.weakKnownPages.length, 0);
  console.log(RULE);
  console.log(`TOTAL pdfs=${results.length} pages=${totalPages} isolatedKnownFlips=${totalFlips} weakKnown=${totalWeak}`);
  console.log("Use these distributions to design confidence/document-context rules; do not patch listed pages.");
  console.log(RULE);
}

await main();

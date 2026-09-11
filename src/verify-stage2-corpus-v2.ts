import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolveDocumentOrientations } from "./document-orientation.js";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPhysicalLayout } from "./physical-layout.js";
import { buildSemanticBlocks } from "./semantic-blocks.js";
import { reconstructPageFlow } from "./text-flow.js";

const WIDTH = 72;
const RULE = "=".repeat(WIDTH);
const SAMPLE_DIRECTORY = "local-samples";
const EXPECTED_PDF_COUNT = 9;
const MAX_REPORTED_ISSUES = 40;

type Issue = {
  file: string;
  page?: number;
  kind: string;
  detail: string;
};

type PageSnapshot = {
  page: number;
  orientation: string;
  semanticText: string;
};

type FileSummary = {
  file: string;
  pageCount: number;
  textPages: number;
  semanticPages: number;
  semanticCharacters: number;
  inferredOrientationPages: number;
  issues: Issue[];
  snapshots: PageSnapshot[];
};

function runBaselineVerification(): { passed: boolean; detail: string | undefined } {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", "verify:semantic"], {
    encoding: "utf8",
    shell: false,
    env: process.env,
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const passed = !result.error && result.status === 0;
  return {
    passed,
    detail: passed
      ? undefined
      : result.error
        ? result.error.stack ?? result.error.message
        : output || `verify:semantic exited with status ${result.status ?? "unknown"}`,
  };
}

function hasVisibleText(page: Awaited<ReturnType<typeof inspectPdf>>["pages"][number]): boolean {
  return page.textItems.some((item) => item.text.trim().length > 0);
}

async function analyzePdf(filePath: string): Promise<FileSummary> {
  const inspection = await inspectPdf(filePath);
  const issues: Issue[] = [];
  const snapshots: PageSnapshot[] = [];
  const textPages = inspection.pages.filter(hasVisibleText);

  const initial = textPages.map((page) => ({
    page,
    flow: reconstructPageFlow(page),
  }));

  const resolved = resolveDocumentOrientations(
    initial.map(({ page, flow }) => ({ page: page.page, orientation: flow.orientation })),
  );
  const resolvedByPage = new Map(resolved.map((entry) => [entry.page, entry]));

  let semanticPages = 0;
  let semanticCharacters = 0;
  let inferredOrientationPages = 0;

  for (const { page, flow } of initial) {
    const orientationEntry = resolvedByPage.get(page.page);
    const orientation = orientationEntry?.resolved ?? flow.orientation;

    if (orientationEntry?.source === "document-context") inferredOrientationPages += 1;

    if (orientation === "unknown") {
      issues.push({
        file: inspection.file,
        page: page.page,
        kind: "unknown-orientation",
        detail: "text-bearing page remains unknown after conservative document-context inference",
      });
      snapshots.push({ page: page.page, orientation, semanticText: "" });
      continue;
    }

    const physical = reconstructPhysicalLayout(page, orientation, flow.bodyFontSize);
    if (physical.units.length === 0) {
      issues.push({
        file: inspection.file,
        page: page.page,
        kind: "empty-physical-layout",
        detail: `orientation=${orientation}, detected=${flow.orientation}, bodyFontSize=${flow.bodyFontSize}`,
      });
      snapshots.push({ page: page.page, orientation, semanticText: "" });
      continue;
    }

    const semantic = buildSemanticBlocks(physical, flow.bodyFontSize);
    if (semantic.blocks.length === 0 || semantic.text.trim().length === 0) {
      issues.push({
        file: inspection.file,
        page: page.page,
        kind: "empty-semantic-layout",
        detail: `physical units=${physical.units.length}, semantic blocks=${semantic.blocks.length}`,
      });
      snapshots.push({ page: page.page, orientation, semanticText: "" });
      continue;
    }

    semanticPages += 1;
    semanticCharacters += [...semantic.text].length;
    snapshots.push({
      page: page.page,
      orientation,
      semanticText: semantic.text,
    });
  }

  return {
    file: inspection.file,
    pageCount: inspection.pages.length,
    textPages: textPages.length,
    semanticPages,
    semanticCharacters,
    inferredOrientationPages,
    issues,
    snapshots,
  };
}

function compareFontPair(left: FileSummary, right: FileSummary): Issue[] {
  const issues: Issue[] = [];

  if (left.pageCount !== right.pageCount) {
    issues.push({
      file: `${left.file} <> ${right.file}`,
      kind: "font-pair-page-count-mismatch",
      detail: `${left.pageCount} pages vs ${right.pageCount} pages`,
    });
    return issues;
  }

  const rightByPage = new Map(right.snapshots.map((snapshot) => [snapshot.page, snapshot]));
  for (const leftPage of left.snapshots) {
    const rightPage = rightByPage.get(leftPage.page);
    if (!rightPage) {
      issues.push({
        file: `${left.file} <> ${right.file}`,
        page: leftPage.page,
        kind: "font-pair-missing-page",
        detail: "matching semantic page snapshot is missing",
      });
      continue;
    }

    if (leftPage.orientation !== rightPage.orientation) {
      issues.push({
        file: `${left.file} <> ${right.file}`,
        page: leftPage.page,
        kind: "font-pair-orientation-mismatch",
        detail: `${leftPage.orientation} vs ${rightPage.orientation}`,
      });
      continue;
    }

    if (leftPage.semanticText !== rightPage.semanticText) {
      issues.push({
        file: `${left.file} <> ${right.file}`,
        page: leftPage.page,
        kind: "font-pair-semantic-mismatch",
        detail: `semantic text differs (${leftPage.semanticText.length} vs ${rightPage.semanticText.length} UTF-16 code units)`,
      });
    }
  }

  return issues;
}

function printPass(summaries: FileSummary[], fontPairPages: number): void {
  const totalPages = summaries.reduce((sum, summary) => sum + summary.pageCount, 0);
  const textPages = summaries.reduce((sum, summary) => sum + summary.textPages, 0);
  const semanticPages = summaries.reduce((sum, summary) => sum + summary.semanticPages, 0);
  const inferred = summaries.reduce((sum, summary) => sum + summary.inferredOrientationPages, 0);

  console.log("");
  console.log(RULE);
  console.log("FILESHAPE STAGE2 FULL CORPUS RESULT: PASS");
  console.log(`PDFs: ${summaries.length}/${EXPECTED_PDF_COUNT}`);
  console.log(`Pages: ${totalPages}`);
  console.log(`Text pages with semantic output: ${semanticPages}/${textPages}`);
  console.log(`Orientation pages resolved by document context: ${inferred}`);
  console.log(`nvl5566 font-pair semantic match: ${fontPairPages}/${fontPairPages} pages`);
  console.log("Stage 2 full-corpus structural verification passed.");
  console.log(RULE);
}

function printFail(
  baselineDetail: string | undefined,
  summaries: FileSummary[],
  issues: Issue[],
  pdfCount: number,
): never {
  console.log("");
  console.log(RULE);
  console.log("!!! FILESHAPE STAGE2 FULL CORPUS RESULT: FAIL !!!");
  console.log(`PDFs found: ${pdfCount}/${EXPECTED_PDF_COUNT}`);

  if (baselineDetail) {
    console.log("");
    console.log("FAIL: baseline semantic verification");
    console.log(baselineDetail);
  }

  if (summaries.length > 0) {
    console.log("");
    console.log("Corpus summary:");
    for (const summary of summaries) {
      console.log(
        `${summary.file}: pages=${summary.pageCount}, text=${summary.textPages}, semantic=${summary.semanticPages}, inferredOrientation=${summary.inferredOrientationPages}, issues=${summary.issues.length}`,
      );
    }
  }

  if (issues.length > 0) {
    console.log("");
    console.log(`Issues: ${issues.length}`);
    for (const issue of issues.slice(0, MAX_REPORTED_ISSUES)) {
      console.log(
        `FAIL: ${issue.file}${issue.page === undefined ? "" : ` page ${issue.page}`} [${issue.kind}] ${issue.detail}`,
      );
    }
    if (issues.length > MAX_REPORTED_ISSUES) {
      console.log(`... ${issues.length - MAX_REPORTED_ISSUES} more issue(s) omitted`);
    }
  }

  console.log("");
  console.log("このFAIL枠を最初から最後までそのまま貼ってください。");
  console.log(RULE);
  process.exit(1);
}

async function main(): Promise<void> {
  const baseline = runBaselineVerification();
  if (!baseline.passed) {
    printFail(baseline.detail, [], [], 0);
  }

  const pdfFiles = readdirSync(SAMPLE_DIRECTORY)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();

  const corpusIssues: Issue[] = [];
  if (pdfFiles.length !== EXPECTED_PDF_COUNT) {
    corpusIssues.push({
      file: SAMPLE_DIRECTORY,
      kind: "unexpected-pdf-count",
      detail: `expected ${EXPECTED_PDF_COUNT} PDFs but found ${pdfFiles.length}`,
    });
  }

  const summaries: FileSummary[] = [];
  for (const name of pdfFiles) {
    try {
      const summary = await analyzePdf(path.join(SAMPLE_DIRECTORY, name));
      summaries.push(summary);
      corpusIssues.push(...summary.issues);
    } catch (error) {
      corpusIssues.push({
        file: name,
        kind: "analysis-exception",
        detail: error instanceof Error ? error.stack ?? error.message : String(error),
      });
    }
  }

  const mincho = summaries.find((summary) => summary.file === "nvl5566.pdf");
  const gothic = summaries.find((summary) => summary.file === "nvl5566-gothic.pdf");
  let fontPairPages = 0;

  if (!mincho || !gothic) {
    corpusIssues.push({
      file: "nvl5566 font pair",
      kind: "font-pair-missing",
      detail: "both nvl5566.pdf and nvl5566-gothic.pdf are required",
    });
  } else {
    fontPairPages = Math.min(mincho.pageCount, gothic.pageCount);
    corpusIssues.push(...compareFontPair(mincho, gothic));
  }

  if (corpusIssues.length > 0) {
    printFail(undefined, summaries, corpusIssues, pdfFiles.length);
  }

  printPass(summaries, fontPairPages);
}

await main();

import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument, OPS, version } from "pdfjs-dist/legacy/build/pdf.mjs";

type OperatorList = { fnArray: number[]; argsArray: unknown[][] };

export type MarkedContentOccurrence = {
  page: number;
  operatorIndex: number;
  kind: "begin" | "begin-props" | "point" | "point-props";
  tag: string;
  depth: number;
  propertyShape?: "none" | "primitive" | "array" | "object";
};

export type PdfMarkedContentInventory = {
  pdfId: string;
  pages: number;
  scannedPages: number;
  occurrences: MarkedContentOccurrence[];
  tagCounts: Record<string, number>;
  wrapperTagCounts: Record<string, number>;
  pointTagCounts: Record<string, number>;
  maxDepth: number;
  issues: string[];
};

export type MarkedContentCorpusInventory = {
  pdfs: number;
  pages: number;
  scannedPages: number;
  occurrences: number;
  tagCounts: Record<string, number>;
  wrapperTagCounts: Record<string, number>;
  pointTagCounts: Record<string, number>;
  maxDepth: number;
  issues: number;
  reports: PdfMarkedContentInventory[];
};

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount;
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, count] of Object.entries(source)) increment(target, key, count);
}

function propertyShape(value: unknown): MarkedContentOccurrence["propertyShape"] {
  if (value === undefined || value === null) return "none";
  if (Array.isArray(value) || ArrayBuffer.isView(value as ArrayBufferView)) return "array";
  if (typeof value === "object") return "object";
  return "primitive";
}

function tagFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function extractMarkedContentEvidence(
  page: number,
  operators: OperatorList,
): { occurrences: MarkedContentOccurrence[]; maxDepth: number; issues: string[] } {
  const occurrences: MarkedContentOccurrence[] = [];
  const issues: string[] = [];
  if (version !== "6.3.289") return { occurrences, maxDepth: 0, issues: [`unsupported-pdfjs-version:${version}`] };

  const stack: string[] = [];
  let maxDepth = 0;
  for (let operatorIndex = 0; operatorIndex < operators.fnArray.length; operatorIndex += 1) {
    const fn = operators.fnArray[operatorIndex]!;
    const args = operators.argsArray[operatorIndex] ?? [];

    if (fn === OPS.beginMarkedContent || fn === OPS.beginMarkedContentProps) {
      const tag = tagFrom(args[0]);
      if (!tag) {
        issues.push(`operator-${operatorIndex}:missing-marked-content-tag`);
        stack.push("?");
        maxDepth = Math.max(maxDepth, stack.length);
        continue;
      }
      const depth = stack.length;
      occurrences.push({
        page,
        operatorIndex,
        kind: fn === OPS.beginMarkedContent ? "begin" : "begin-props",
        tag,
        depth,
        ...(fn === OPS.beginMarkedContentProps ? { propertyShape: propertyShape(args[1]) } : {}),
      });
      stack.push(tag);
      maxDepth = Math.max(maxDepth, stack.length);
      continue;
    }

    if (fn === OPS.endMarkedContent) {
      if (stack.length === 0) issues.push(`operator-${operatorIndex}:marked-content-end-underflow`);
      else stack.pop();
      continue;
    }

    if (fn === OPS.markPoint || fn === OPS.markPointProps) {
      const tag = tagFrom(args[0]);
      if (!tag) {
        issues.push(`operator-${operatorIndex}:missing-mark-point-tag`);
        continue;
      }
      occurrences.push({
        page,
        operatorIndex,
        kind: fn === OPS.markPoint ? "point" : "point-props",
        tag,
        depth: stack.length,
        ...(fn === OPS.markPointProps ? { propertyShape: propertyShape(args[1]) } : {}),
      });
    }
  }
  if (stack.length > 0) issues.push(`marked-content-stack-not-empty:${stack.length}`);
  return { occurrences, maxDepth, issues };
}

export async function inspectPdfMarkedContent(inputPath: string): Promise<PdfMarkedContentInventory> {
  const bytes = new Uint8Array(await readFile(inputPath));
  const pdfId = `sha256:${hash(bytes).slice(0, 16)}`;
  const task = getDocument({ data: bytes });
  try {
    const pdf = await task.promise;
    const occurrences: MarkedContentOccurrence[] = [];
    const issues: string[] = [];
    let maxDepth = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const operatorList = await page.getOperatorList();
        const extracted = extractMarkedContentEvidence(pageNumber, operatorList);
        occurrences.push(...extracted.occurrences);
        issues.push(...extracted.issues.map((issue) => `page-${pageNumber}:${issue}`));
        maxDepth = Math.max(maxDepth, extracted.maxDepth);
      } finally {
        page.cleanup();
      }
    }
    const tagCounts: Record<string, number> = {};
    const wrapperTagCounts: Record<string, number> = {};
    const pointTagCounts: Record<string, number> = {};
    for (const occurrence of occurrences) {
      increment(tagCounts, occurrence.tag);
      if (occurrence.kind === "begin" || occurrence.kind === "begin-props") increment(wrapperTagCounts, occurrence.tag);
      else increment(pointTagCounts, occurrence.tag);
    }
    return {
      pdfId,
      pages: pdf.numPages,
      scannedPages: pdf.numPages,
      occurrences,
      tagCounts,
      wrapperTagCounts,
      pointTagCounts,
      maxDepth,
      issues,
    };
  } finally {
    await task.destroy();
  }
}

export function summarizeMarkedContentCorpus(reports: PdfMarkedContentInventory[]): MarkedContentCorpusInventory {
  const tagCounts: Record<string, number> = {};
  const wrapperTagCounts: Record<string, number> = {};
  const pointTagCounts: Record<string, number> = {};
  for (const report of reports) {
    mergeCounts(tagCounts, report.tagCounts);
    mergeCounts(wrapperTagCounts, report.wrapperTagCounts);
    mergeCounts(pointTagCounts, report.pointTagCounts);
  }
  return {
    pdfs: reports.length,
    pages: reports.reduce((sum, report) => sum + report.pages, 0),
    scannedPages: reports.reduce((sum, report) => sum + report.scannedPages, 0),
    occurrences: reports.reduce((sum, report) => sum + report.occurrences.length, 0),
    tagCounts,
    wrapperTagCounts,
    pointTagCounts,
    maxDepth: reports.reduce((max, report) => Math.max(max, report.maxDepth), 0),
    issues: reports.reduce((sum, report) => sum + report.issues.length, 0),
    reports,
  };
}

function parseNonNegativeInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer`);
  return parsed;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const input = argv.shift();
  if (!input || input.startsWith("--")) {
    throw new Error("usage: npm run inspect:marked-content -- PDF_OR_DIRECTORY --output NEW_FILE [--expect-pdf-count N] [--expect-page-count N]");
  }
  let output: string | undefined;
  let expectedPdfs: number | undefined;
  let expectedPages: number | undefined;
  while (argv.length > 0) {
    const flag = argv.shift()!;
    const value = argv.shift();
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${flag}`);
    if (flag === "--output") output = value;
    else if (flag === "--expect-pdf-count") expectedPdfs = parseNonNegativeInteger(value, flag);
    else if (flag === "--expect-page-count") expectedPages = parseNonNegativeInteger(value, flag);
    else throw new Error(`unknown option ${flag}`);
  }
  if (!output) throw new Error("--output NEW_FILE is required; marked-content evidence reports are local-only");

  const inputStat = await stat(input);
  const files = inputStat.isDirectory()
    ? (await readdir(input, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
      .map((entry) => path.join(input, entry.name))
      .sort()
    : [input];
  if (files.length === 0) throw new Error("no PDF files found");

  const reports: PdfMarkedContentInventory[] = [];
  for (const [index, file] of files.entries()) {
    process.stderr.write(`Marked-content inventory: ${index + 1}/${files.length}\n`);
    reports.push(await inspectPdfMarkedContent(file));
  }
  const report = summarizeMarkedContentCorpus(reports);
  if (expectedPdfs !== undefined && report.pdfs !== expectedPdfs) throw new Error(`expected ${expectedPdfs} PDFs but found ${report.pdfs}`);
  if (expectedPages !== undefined && report.pages !== expectedPages) throw new Error(`expected ${expectedPages} pages but found ${report.pages}`);
  if (report.pages !== report.scannedPages) throw new Error(`marked-content inventory scanned ${report.scannedPages}/${report.pages} pages`);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`PDFs=${report.pdfs}\nPAGES=${report.pages}\nMARKED_CONTENT_OCCURRENCES=${report.occurrences}\nTAG_COUNTS=${JSON.stringify(report.tagCounts)}\nMAX_DEPTH=${report.maxDepth}\nISSUES=${report.issues}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

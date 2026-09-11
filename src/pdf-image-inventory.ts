import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  extractImagePaintEvidence,
  type ImagePaintEvidence,
  type ImagePaintKind,
} from "./pdf-image-adapter.js";

export type ImageInventoryPaint = Omit<ImagePaintEvidence, "resourceId"> & {
  resourceRefHash?: string;
};

export type PdfImageInventory = {
  pdfId: string;
  byteLength: number;
  pages: number;
  scannedPages: number;
  paintOperations: number;
  supportedPaints: number;
  unsupportedPaints: number;
  uniqueResourceRefs: number;
  formPaints: number;
  clipObservedPaints: number;
  kindCounts: Record<string, number>;
  reasonCounts: Record<string, number>;
  issues: string[];
  pageReports: Array<{
    page: number;
    rotation: number;
    userUnit: number;
    view: number[];
    viewportTransform: number[];
    paints: ImageInventoryPaint[];
  }>;
};

export type ImageCorpusInventory = {
  pdfs: number;
  pages: number;
  scannedPages: number;
  paintOperations: number;
  supportedPaints: number;
  unsupportedPaints: number;
  uniqueResourceRefs: number;
  formPaints: number;
  clipObservedPaints: number;
  kindCounts: Record<string, number>;
  reasonCounts: Record<string, number>;
  reports: PdfImageInventory[];
};

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount;
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, count] of Object.entries(source)) increment(target, key, count);
}

function publicPaint(paint: ImagePaintEvidence): ImageInventoryPaint {
  const { resourceId, ...rest } = paint;
  return {
    ...rest,
    ...(resourceId === undefined ? {} : { resourceRefHash: hash(resourceId) }),
  };
}

export async function inspectPdfImages(inputPath: string): Promise<PdfImageInventory> {
  const bytes = new Uint8Array(await readFile(inputPath));
  // PDF.js may transfer/detach the provided buffer. Capture identity and size first.
  const byteLength = bytes.byteLength;
  const pdfId = `sha256:${hash(bytes).slice(0, 16)}`;
  const task = getDocument({ data: bytes });
  try {
    const pdf = await task.promise;
    const pageReports: PdfImageInventory["pageReports"] = [];
    const kindCounts: Record<string, number> = {};
    const reasonCounts: Record<string, number> = {};
    const issues: string[] = [];
    const resourceRefs = new Set<string>();
    let supportedPaints = 0;
    let unsupportedPaints = 0;
    let formPaints = 0;
    let clipObservedPaints = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const operators = await page.getOperatorList();
        const extracted = extractImagePaintEvidence(
          pageNumber,
          { fnArray: operators.fnArray, argsArray: operators.argsArray },
          [...viewport.transform],
        );
        const paints = extracted.paints.map(publicPaint);
        for (const paint of paints) {
          increment(kindCounts, paint.kind);
          if (paint.status === "supported-evidence") supportedPaints += 1;
          else unsupportedPaints += 1;
          if (paint.reason) increment(reasonCounts, paint.reason);
          if (paint.resourceRefHash) resourceRefs.add(paint.resourceRefHash);
          if (paint.formDepth > 0) formPaints += 1;
          if (paint.clipObserved) clipObservedPaints += 1;
        }
        issues.push(...extracted.issues.map((issue) => `page-${pageNumber}:${issue}`));
        pageReports.push({
          page: pageNumber,
          rotation: viewport.rotation,
          userUnit: page.userUnit,
          view: [...page.view],
          viewportTransform: [...viewport.transform],
          paints,
        });
      } finally {
        page.cleanup();
      }
    }

    const paintOperations = pageReports.reduce((sum, page) => sum + page.paints.length, 0);
    return {
      pdfId,
      byteLength,
      pages: pdf.numPages,
      scannedPages: pageReports.length,
      paintOperations,
      supportedPaints,
      unsupportedPaints,
      uniqueResourceRefs: resourceRefs.size,
      formPaints,
      clipObservedPaints,
      kindCounts,
      reasonCounts,
      issues,
      pageReports,
    };
  } finally {
    await task.destroy();
  }
}

export function summarizeImageCorpus(reports: PdfImageInventory[]): ImageCorpusInventory {
  const kindCounts: Record<string, number> = {};
  const reasonCounts: Record<string, number> = {};
  for (const report of reports) {
    mergeCounts(kindCounts, report.kindCounts);
    mergeCounts(reasonCounts, report.reasonCounts);
  }
  return {
    pdfs: reports.length,
    pages: reports.reduce((sum, report) => sum + report.pages, 0),
    scannedPages: reports.reduce((sum, report) => sum + report.scannedPages, 0),
    paintOperations: reports.reduce((sum, report) => sum + report.paintOperations, 0),
    supportedPaints: reports.reduce((sum, report) => sum + report.supportedPaints, 0),
    unsupportedPaints: reports.reduce((sum, report) => sum + report.unsupportedPaints, 0),
    uniqueResourceRefs: reports.reduce((sum, report) => sum + report.uniqueResourceRefs, 0),
    formPaints: reports.reduce((sum, report) => sum + report.formPaints, 0),
    clipObservedPaints: reports.reduce((sum, report) => sum + report.clipObservedPaints, 0),
    kindCounts,
    reasonCounts,
    reports,
  };
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer`);
  return parsed;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const input = argv.shift();
  if (!input || input.startsWith("--")) {
    throw new Error("usage: npm run inspect:images -- PDF_OR_DIRECTORY --output NEW_FILE [--expect-pdf-count N] [--expect-page-count N]");
  }

  let output: string | undefined;
  let expectedPdfs: number | undefined;
  let expectedPages: number | undefined;
  while (argv.length > 0) {
    const flag = argv.shift()!;
    const value = argv.shift();
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${flag}`);
    if (flag === "--output") output = value;
    else if (flag === "--expect-pdf-count") expectedPdfs = parsePositiveInteger(value, flag);
    else if (flag === "--expect-page-count") expectedPages = parsePositiveInteger(value, flag);
    else throw new Error(`unknown option ${flag}`);
  }
  if (!output) throw new Error("--output NEW_FILE is required; image evidence reports are local-only");

  const inputStat = await stat(input);
  const files = inputStat.isDirectory()
    ? (await readdir(input, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
      .map((entry) => path.join(input, entry.name))
      .sort()
    : [input];
  if (files.length === 0) throw new Error("no PDF files found");

  const reports: PdfImageInventory[] = [];
  for (const [index, file] of files.entries()) {
    process.stderr.write(`Image inventory: ${index + 1}/${files.length}\n`);
    reports.push(await inspectPdfImages(file));
  }
  const report = summarizeImageCorpus(reports);
  if (expectedPdfs !== undefined && report.pdfs !== expectedPdfs) {
    throw new Error(`expected ${expectedPdfs} PDFs but found ${report.pdfs}`);
  }
  if (expectedPages !== undefined && report.pages !== expectedPages) {
    throw new Error(`expected ${expectedPages} pages but found ${report.pages}`);
  }
  if (report.scannedPages !== report.pages) {
    throw new Error(`image inventory scanned ${report.scannedPages}/${report.pages} pages`);
  }
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`PDFs=${report.pdfs}\nPAGES=${report.pages}\nIMAGE_PAINTS=${report.paintOperations}\nSUPPORTED=${report.supportedPaints}\nUNSUPPORTED=${report.unsupportedPaints}\nRESOURCE_REFS=${report.uniqueResourceRefs}\nFORM_PAINTS=${report.formPaints}\nCLIPPED_PAINTS=${report.clipObservedPaints}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

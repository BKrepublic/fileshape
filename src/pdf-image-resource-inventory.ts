import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractImagePaintEvidence } from "./pdf-image-adapter.js";
import { resolvePdfImageResource } from "./pdf-image-resource-adapter.js";

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function increment(record: Record<string, number>, key: string, amount = 1): void {
  record[key] = (record[key] ?? 0) + amount;
}

type PublicResource = {
  page: number;
  resourceRefHash: string;
  status: "extracted" | "unsupported";
  reason?: string;
  width?: number;
  height?: number;
  pixelKind?: string;
  decodedByteLength?: number;
  pngByteLength?: number;
  contentHash?: string;
};

type PublicOccurrence = {
  page: number;
  operatorIndex: number;
  occurrenceIndex: number;
  kind: string;
  resourceRefHash?: string;
  contentHash?: string;
  displayTransform: number[];
  formDepth: number;
  clipObserved: boolean;
};

export type PdfImageResourceInventory = {
  pdfId: string;
  byteLength: number;
  pages: number;
  imagePaints: number;
  xobjectPaints: number;
  resources: PublicResource[];
  occurrences: PublicOccurrence[];
  extractedResources: number;
  unsupportedResources: number;
  uniqueContentResources: number;
  totalDecodedBytes: number;
  totalPngBytes: number;
  maxPixels: number;
  pixelKindCounts: Record<string, number>;
  failureReasonCounts: Record<string, number>;
};

export type ImageResourceCorpusInventory = {
  pdfs: number;
  pages: number;
  imagePaints: number;
  xobjectPaints: number;
  extractedResources: number;
  unsupportedResources: number;
  uniqueContentResources: number;
  totalDecodedBytes: number;
  totalPngBytes: number;
  maxPixels: number;
  pixelKindCounts: Record<string, number>;
  failureReasonCounts: Record<string, number>;
  reports: PdfImageResourceInventory[];
};

type PageWithObjects = {
  objs: { get(id: string): unknown };
};

export async function inspectPdfImageResources(inputPath: string): Promise<PdfImageResourceInventory> {
  const bytes = new Uint8Array(await readFile(inputPath));
  const byteLength = bytes.byteLength;
  const pdfId = `sha256:${hash(bytes).slice(0, 16)}`;
  const task = getDocument({ data: bytes });
  try {
    const pdf = await task.promise;
    const resources: PublicResource[] = [];
    const occurrences: PublicOccurrence[] = [];
    const seenRefs = new Map<string, PublicResource>();
    const contentHashes = new Set<string>();
    const pixelKindCounts: Record<string, number> = {};
    const failureReasonCounts: Record<string, number> = {};
    let imagePaints = 0;
    let xobjectPaints = 0;
    let totalDecodedBytes = 0;
    let totalPngBytes = 0;
    let maxPixels = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const operators = await page.getOperatorList();
        const evidence = extractImagePaintEvidence(
          pageNumber,
          { fnArray: operators.fnArray, argsArray: operators.argsArray },
          [...viewport.transform],
        );
        if (evidence.issues.length > 0) {
          throw new Error(`page ${pageNumber} image evidence issues: ${evidence.issues.join(", ")}`);
        }
        imagePaints += evidence.paints.length;
        const store = (page as unknown as PageWithObjects).objs;

        for (const paint of evidence.paints) {
          const resourceRefHash = paint.resourceId === undefined ? undefined : hash(paint.resourceId);
          let publicResource: PublicResource | undefined;
          if ((paint.kind === "xobject" || paint.kind === "xobject-repeat") && paint.resourceId) {
            xobjectPaints += 1;
            const dedupeKey = `${pageNumber}:${paint.resourceId}`;
            publicResource = seenRefs.get(dedupeKey);
            if (!publicResource) {
              const extracted = resolvePdfImageResource(store, paint.resourceId);
              if ("status" in extracted) {
                publicResource = {
                  page: pageNumber,
                  resourceRefHash: hash(paint.resourceId),
                  status: "unsupported",
                  reason: extracted.reason,
                };
                increment(failureReasonCounts, extracted.reason);
              } else {
                publicResource = {
                  page: pageNumber,
                  resourceRefHash: hash(paint.resourceId),
                  status: "extracted",
                  width: extracted.width,
                  height: extracted.height,
                  pixelKind: extracted.pixelKind,
                  decodedByteLength: extracted.decodedByteLength,
                  pngByteLength: extracted.bytes.byteLength,
                  contentHash: extracted.contentHash,
                };
                increment(pixelKindCounts, extracted.pixelKind);
                totalDecodedBytes += extracted.decodedByteLength;
                totalPngBytes += extracted.bytes.byteLength;
                maxPixels = Math.max(maxPixels, extracted.width * extracted.height);
                contentHashes.add(extracted.contentHash);
              }
              seenRefs.set(dedupeKey, publicResource);
              resources.push(publicResource);
            }
          }

          occurrences.push({
            page: pageNumber,
            operatorIndex: paint.operatorIndex,
            occurrenceIndex: paint.occurrenceIndex,
            kind: paint.kind,
            ...(resourceRefHash === undefined ? {} : { resourceRefHash }),
            ...(publicResource?.status === "extracted" && publicResource.contentHash
              ? { contentHash: publicResource.contentHash }
              : {}),
            displayTransform: [...paint.displayTransform],
            formDepth: paint.formDepth,
            clipObserved: paint.clipObserved,
          });
        }
      } finally {
        page.cleanup();
      }
    }

    return {
      pdfId,
      byteLength,
      pages: pdf.numPages,
      imagePaints,
      xobjectPaints,
      resources,
      occurrences,
      extractedResources: resources.filter((resource) => resource.status === "extracted").length,
      unsupportedResources: resources.filter((resource) => resource.status === "unsupported").length,
      uniqueContentResources: contentHashes.size,
      totalDecodedBytes,
      totalPngBytes,
      maxPixels,
      pixelKindCounts,
      failureReasonCounts,
    };
  } finally {
    await task.destroy();
  }
}

export function summarizeImageResourceCorpus(reports: PdfImageResourceInventory[]): ImageResourceCorpusInventory {
  const pixelKindCounts: Record<string, number> = {};
  const failureReasonCounts: Record<string, number> = {};
  const contentHashes = new Set<string>();
  for (const report of reports) {
    for (const [key, count] of Object.entries(report.pixelKindCounts)) increment(pixelKindCounts, key, count);
    for (const [key, count] of Object.entries(report.failureReasonCounts)) increment(failureReasonCounts, key, count);
    for (const resource of report.resources) if (resource.contentHash) contentHashes.add(resource.contentHash);
  }
  return {
    pdfs: reports.length,
    pages: reports.reduce((sum, report) => sum + report.pages, 0),
    imagePaints: reports.reduce((sum, report) => sum + report.imagePaints, 0),
    xobjectPaints: reports.reduce((sum, report) => sum + report.xobjectPaints, 0),
    extractedResources: reports.reduce((sum, report) => sum + report.extractedResources, 0),
    unsupportedResources: reports.reduce((sum, report) => sum + report.unsupportedResources, 0),
    uniqueContentResources: contentHashes.size,
    totalDecodedBytes: reports.reduce((sum, report) => sum + report.totalDecodedBytes, 0),
    totalPngBytes: reports.reduce((sum, report) => sum + report.totalPngBytes, 0),
    maxPixels: reports.reduce((max, report) => Math.max(max, report.maxPixels), 0),
    pixelKindCounts,
    failureReasonCounts,
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
    throw new Error("usage: npm run inspect:image-resources -- PDF_OR_DIRECTORY --output NEW_FILE [--expect-pdf-count N] [--expect-page-count N]");
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
  if (!output) throw new Error("--output NEW_FILE is required; image resource reports are local-only");

  const inputStat = await stat(input);
  const files = inputStat.isDirectory()
    ? (await readdir(input, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
      .map((entry) => path.join(input, entry.name))
      .sort()
    : [input];
  if (files.length === 0) throw new Error("no PDF files found");

  const reports: PdfImageResourceInventory[] = [];
  for (const [index, file] of files.entries()) {
    process.stderr.write(`Image resources: ${index + 1}/${files.length}\n`);
    reports.push(await inspectPdfImageResources(file));
  }
  const report = summarizeImageResourceCorpus(reports);
  if (expectedPdfs !== undefined && report.pdfs !== expectedPdfs) {
    throw new Error(`expected ${expectedPdfs} PDFs but found ${report.pdfs}`);
  }
  if (expectedPages !== undefined && report.pages !== expectedPages) {
    throw new Error(`expected ${expectedPages} pages but found ${report.pages}`);
  }
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(
    `PDFs=${report.pdfs}\nPAGES=${report.pages}\nIMAGE_PAINTS=${report.imagePaints}\nXOBJECT_PAINTS=${report.xobjectPaints}\n` +
    `EXTRACTED_RESOURCES=${report.extractedResources}\nUNSUPPORTED_RESOURCES=${report.unsupportedResources}\n` +
    `UNIQUE_CONTENT_RESOURCES=${report.uniqueContentResources}\nTOTAL_DECODED_BYTES=${report.totalDecodedBytes}\n` +
    `TOTAL_PNG_BYTES=${report.totalPngBytes}\nMAX_PIXELS=${report.maxPixels}\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDocumentFromInspection } from "./pdf-document-pipeline.js";
import { inspectPdf } from "./pdf-inspector.js";

type Expectations = {
  pdfs?: number;
  pages?: number;
  occurrences?: number;
  uniqueResources?: number;
};

function nonNegativeInteger(value: string | undefined, flag: string): number {
  if (value === undefined) throw new Error(`missing value for ${flag}`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer`);
  return parsed;
}

function parseArguments(argv: string[]): { input: string; expected: Expectations } {
  const input = argv.shift();
  if (!input || input.startsWith("--")) {
    throw new Error("usage: npm run verify:image-model -- PDF_OR_DIRECTORY [--expect-pdf-count N] [--expect-page-count N] [--expect-image-occurrence-count N] [--expect-unique-content-resource-count N]");
  }
  const expected: Expectations = {};
  while (argv.length > 0) {
    const flag = argv.shift()!;
    const value = argv.shift();
    if (flag === "--expect-pdf-count") expected.pdfs = nonNegativeInteger(value, flag);
    else if (flag === "--expect-page-count") expected.pages = nonNegativeInteger(value, flag);
    else if (flag === "--expect-image-occurrence-count") expected.occurrences = nonNegativeInteger(value, flag);
    else if (flag === "--expect-unique-content-resource-count") expected.uniqueResources = nonNegativeInteger(value, flag);
    else throw new Error(`unknown option ${flag}`);
  }
  return { input, expected };
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

function expectEqual(actual: number, expected: number | undefined, label: string): void {
  if (expected !== undefined && actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

async function main(): Promise<void> {
  const { input, expected } = parseArguments(process.argv.slice(2));
  const files = await pdfFiles(input);
  let pages = 0;
  let resources = 0;
  let occurrences = 0;
  const contentHashes = new Set<string>();

  for (const [index, file] of files.entries()) {
    process.stderr.write(`Production image model: ${index + 1}/${files.length}\n`);
    const inspection = await inspectPdf(file, { includeImages: true });
    const { document } = buildDocumentFromInspection(inspection, `local:image-model:${index + 1}`);
    pages += document.pages.length;
    resources += document.imageResources.length;
    occurrences += document.pages.reduce((sum, page) => sum + page.imageOccurrences.length, 0);
    for (const resource of document.imageResources) contentHashes.add(resource.contentHash);
  }

  expectEqual(files.length, expected.pdfs, "PDF count");
  expectEqual(pages, expected.pages, "page count");
  expectEqual(occurrences, expected.occurrences, "image occurrence count");
  expectEqual(contentHashes.size, expected.uniqueResources, "unique content resource count");

  console.log(`PDFS=${files.length}`);
  console.log(`PAGES=${pages}`);
  console.log(`MODEL_IMAGE_RESOURCES=${resources}`);
  console.log(`IMAGE_OCCURRENCES=${occurrences}`);
  console.log(`UNIQUE_CONTENT_RESOURCES=${contentHashes.size}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}

import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { convertPdfToEpub } from "./pdf-to-epub.js";

const WIDTH = 72;
const RULE = "=".repeat(WIDTH);
const SAMPLE_DIRECTORY = "local-samples";
const EXPECTED_PDF_COUNT = 9;
const EXPECTED_TOTAL_PAGES = 5141;
const EPUB_MIMETYPE = "application/epub+zip";

type Summary = {
  file: string;
  pages: number;
  unresolvedAnnotations: number;
  bytes: number;
};

type Issue = {
  file: string;
  detail: string;
};

function firstZipEntry(bytes: Buffer): { name: string; method: number; data: Buffer } {
  if (bytes.length < 30) throw new Error("archive is too short for a ZIP local header");
  const signature = bytes.readUInt32LE(0);
  if (signature !== 0x04034b50) throw new Error(`invalid first ZIP signature 0x${signature.toString(16)}`);
  const method = bytes.readUInt16LE(8);
  const size = bytes.readUInt32LE(18);
  const nameLength = bytes.readUInt16LE(26);
  const extraLength = bytes.readUInt16LE(28);
  const nameStart = 30;
  const dataStart = nameStart + nameLength + extraLength;
  const dataEnd = dataStart + size;
  if (dataEnd > bytes.length) throw new Error("first ZIP entry exceeds archive length");
  return {
    name: bytes.subarray(nameStart, nameStart + nameLength).toString("utf8"),
    method,
    data: bytes.subarray(dataStart, dataEnd),
  };
}

function validateArchive(bytes: Buffer, pages: number): string[] {
  const issues: string[] = [];
  try {
    const first = firstZipEntry(bytes);
    if (first.name !== "mimetype") issues.push(`first ZIP entry is ${first.name}, expected mimetype`);
    if (first.method !== 0) issues.push(`mimetype compression method is ${first.method}, expected 0`);
    if (first.data.toString("utf8") !== EPUB_MIMETYPE) issues.push("mimetype payload differs from application/epub+zip");
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  for (const required of ["META-INF/container.xml", "OEBPS/package.opf", "OEBPS/nav.xhtml"]) {
    if (!bytes.includes(Buffer.from(required))) issues.push(`archive does not reference ${required}`);
  }

  if (pages > 0) {
    const firstPage = "OEBPS/text/page-0001.xhtml";
    const lastPage = `OEBPS/text/page-${String(pages).padStart(4, "0")}.xhtml`;
    if (!bytes.includes(Buffer.from(firstPage))) issues.push(`archive does not reference ${firstPage}`);
    if (!bytes.includes(Buffer.from(lastPage))) issues.push(`archive does not reference ${lastPage}`);
  }

  return issues;
}

function printFail(issues: Issue[], summaries: Summary[]): never {
  console.log("");
  console.log(RULE);
  console.log("!!! FILESHAPE EPUB FULL CORPUS RESULT: FAIL !!!");
  for (const summary of summaries) {
    console.log(`${summary.file}: pages=${summary.pages}, unresolved=${summary.unresolvedAnnotations}, bytes=${summary.bytes}`);
  }
  for (const issue of issues) console.log(`FAIL: ${issue.file}: ${issue.detail}`);
  console.log(RULE);
  process.exit(1);
}

async function main(): Promise<void> {
  let names: string[];
  try {
    names = (await readdir(SAMPLE_DIRECTORY))
      .filter((name) => name.toLowerCase().endsWith(".pdf"))
      .sort();
  } catch (error) {
    printFail([{ file: SAMPLE_DIRECTORY, detail: error instanceof Error ? error.message : String(error) }], []);
  }

  const issues: Issue[] = [];
  if (names.length !== EXPECTED_PDF_COUNT) {
    issues.push({ file: SAMPLE_DIRECTORY, detail: `expected ${EXPECTED_PDF_COUNT} PDFs but found ${names.length}` });
  }

  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "fileshape-epub-corpus-"));
  const summaries: Summary[] = [];

  try {
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index]!;
      console.log(`[${index + 1}/${names.length}] PDF -> EPUB: ${name}`);
      const input = path.join(SAMPLE_DIRECTORY, name);
      const output = path.join(outputDirectory, `${path.parse(name).name}.epub`);
      try {
        const result = await convertPdfToEpub(input, output, {
          title: path.parse(name).name,
          modified: "2026-09-11T00:00:00Z",
        });
        const bytes = await readFile(output);
        if (bytes.length !== result.byteLength) {
          issues.push({ file: name, detail: `reported bytes=${result.byteLength}, actual bytes=${bytes.length}` });
        }
        for (const detail of validateArchive(bytes, result.pageCount)) issues.push({ file: name, detail });
        summaries.push({
          file: name,
          pages: result.pageCount,
          unresolvedAnnotations: result.unresolvedAnnotationCount,
          bytes: result.byteLength,
        });
      } catch (error) {
        issues.push({ file: name, detail: error instanceof Error ? error.stack ?? error.message : String(error) });
      }
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }

  const totalPages = summaries.reduce((sum, summary) => sum + summary.pages, 0);
  if (totalPages !== EXPECTED_TOTAL_PAGES) {
    issues.push({ file: SAMPLE_DIRECTORY, detail: `expected ${EXPECTED_TOTAL_PAGES} total pages but converted ${totalPages}` });
  }
  if (summaries.length !== EXPECTED_PDF_COUNT) {
    issues.push({ file: SAMPLE_DIRECTORY, detail: `expected ${EXPECTED_PDF_COUNT} successful EPUBs but produced ${summaries.length}` });
  }

  if (issues.length > 0) printFail(issues, summaries);

  const totalUnresolved = summaries.reduce((sum, summary) => sum + summary.unresolvedAnnotations, 0);
  const totalBytes = summaries.reduce((sum, summary) => sum + summary.bytes, 0);
  console.log("");
  console.log(RULE);
  console.log("FILESHAPE EPUB FULL CORPUS RESULT: PASS");
  console.log(`PDFs: ${summaries.length}/${EXPECTED_PDF_COUNT}`);
  console.log(`EPUBs: ${summaries.length}/${EXPECTED_PDF_COUNT}`);
  console.log(`Pages: ${totalPages}/${EXPECTED_TOTAL_PAGES}`);
  console.log(`Unresolved annotations preserved: ${totalUnresolved}`);
  console.log(`Total EPUB bytes: ${totalBytes}`);
  console.log("All corpus PDFs completed end-to-end PDF -> EPUB conversion.");
  console.log(RULE);
}

await main();

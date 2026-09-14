import { readdirSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { convertPdfToEpub } from "./pdf-to-epub.js";
import { inspectPdf } from "./pdf-inspector.js";
import { reconstructPhysicalLayout } from "./physical-layout.js";
import { buildSemanticBlocks } from "./semantic-blocks.js";
import { reconstructPageFlow } from "./text-flow.js";

const SAMPLE_DIRECTORY = "local-samples";
const EXPECTED_PDF_COUNT = 9;
const EXPECTED_TOTAL_PAGES = 5141;
const RULE = "=".repeat(72);

type Issue = { file: string; detail: string };
type ZipEntry = { path: string; data: Buffer };

function zipEntries(bytes: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8);
    if (method !== 0) throw new Error(`quality verifier expects stored ZIP entries, got method ${method}`);
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + size;
    if (dataEnd > bytes.length) throw new Error("truncated EPUB ZIP entry");
    entries.push({
      path: bytes.toString("utf8", nameStart, nameStart + nameLength),
      data: bytes.subarray(dataStart, dataEnd),
    });
    offset = dataEnd;
  }
  return entries;
}

function compactText(value: string): string {
  return value.replace(/[\s\u3000]+/gu, "");
}

async function semanticText(filePath: string, pageNumber: number): Promise<string> {
  const inspection = await inspectPdf(filePath);
  const page = inspection.pages.find((candidate) => candidate.page === pageNumber);
  if (!page) throw new Error(`page ${pageNumber} does not exist`);
  const flow = reconstructPageFlow(page);
  const physical = reconstructPhysicalLayout(page, flow.orientation, flow.bodyFontSize);
  return buildSemanticBlocks(physical, flow.bodyFontSize).text;
}

async function checkKnownReadingOrderSample(filePath: string, issues: Issue[]): Promise<void> {
  const name = path.basename(filePath);
  if (name !== "nvl5566.pdf" && name !== "nvl5566-gothic.pdf") return;

  const compact = compactText(await semanticText(filePath, 2));
  const expectedRuns = [
    "注意事項",
    "このＰＤＦファイルは「暁～小説投稿サイト～」で掲載中の小説",
    "この小説の著作権は小説の作者にあります",
    "【小説タイトル】嘘のようで本当の自衛隊体験",
  ];
  let cursor = -1;
  for (const run of expectedRuns) {
    const next = compact.indexOf(run, cursor + 1);
    if (next < 0) {
      issues.push({
        file: name,
        detail: `page 2 reading order lost source-backed run: ${run}`,
      });
      return;
    }
    cursor = next;
  }
}

async function main(): Promise<void> {
  const names = readdirSync(SAMPLE_DIRECTORY)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();
  const issues: Issue[] = [];
  if (names.length !== EXPECTED_PDF_COUNT) {
    issues.push({ file: SAMPLE_DIRECTORY, detail: `expected ${EXPECTED_PDF_COUNT} PDFs but found ${names.length}` });
  }

  const outputDirectory = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), "fileshape-generic-quality-")));
  let totalPages = 0;

  try {
    for (const [index, name] of names.entries()) {
      const input = path.join(SAMPLE_DIRECTORY, name);
      const output = path.join(outputDirectory, `${path.parse(name).name}.epub`);
      console.log(`[${index + 1}/${names.length}] quality: ${name}`);

      await checkKnownReadingOrderSample(input, issues);

      const result = await convertPdfToEpub(input, output, {
        title: path.parse(name).name,
        modified: "2026-09-14T00:00:00Z",
      });
      totalPages += result.pageCount;
      const entries = zipEntries(await readFile(output));
      const textEntries = entries.filter((entry) => /^OEBPS\/text\/.*\.xhtml$/u.test(entry.path));
      const visibleNoteEntries = textEntries.filter((entry) =>
        entry.data.includes(Buffer.from("fileshape-unresolved-notes")) ||
        entry.data.includes(Buffer.from("fileshape-unresolved-annotation")));

      // FileShape is a reflow converter. Physical PDF pages are source provenance,
      // not default EPUB spine boundaries. Corpus-specific expectations live here,
      // never in production conversion code.
      if (result.pageCount > 1 && textEntries.length >= result.pageCount) {
        issues.push({
          file: name,
          detail: `physical-page pagination leaked into EPUB: ${textEntries.length} content XHTML resources for ${result.pageCount} PDF pages`,
        });
      }

      if (result.navigation.mode === "outline") {
        // Outline destinations are strong source-backed logical boundaries. A small
        // front-matter allowance keeps this test independent of any title words.
        const generousMaximum = result.navigation.outlineEntries + 16;
        if (textEntries.length > generousMaximum) {
          issues.push({
            file: name,
            detail: `outline-backed reflow has ${textEntries.length} content XHTML resources; expected <= ${generousMaximum} from ${result.navigation.outlineEntries} source outline entries plus front matter`,
          });
        }
      }

      if (visibleNoteEntries.length > 0) {
        issues.push({
          file: name,
          detail: `${visibleNoteEntries.length} spine XHTML resource(s) expose unresolved ruby/annotation fragments as reader-visible notes`,
        });
      }
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }

  if (totalPages !== EXPECTED_TOTAL_PAGES) {
    issues.push({ file: SAMPLE_DIRECTORY, detail: `expected ${EXPECTED_TOTAL_PAGES} pages but converted ${totalPages}` });
  }

  console.log("");
  console.log(RULE);
  if (issues.length === 0) {
    console.log("FILESHAPE GENERIC CORPUS QUALITY: PASS");
    console.log(`PDFs: ${names.length}/${EXPECTED_PDF_COUNT}; pages: ${totalPages}/${EXPECTED_TOTAL_PAGES}`);
    console.log("No physical-page spine leakage, visible unresolved-note pollution, or known reading-order regression detected.");
    console.log(RULE);
    return;
  }

  console.log("!!! FILESHAPE GENERIC CORPUS QUALITY: FAIL !!!");
  console.log(`PDFs: ${names.length}/${EXPECTED_PDF_COUNT}; pages: ${totalPages}/${EXPECTED_TOTAL_PAGES}`);
  for (const issue of issues) console.log(`FAIL: ${issue.file}: ${issue.detail}`);
  console.log(RULE);
  process.exitCode = 1;
}

await main();

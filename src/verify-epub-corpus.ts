import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { convertPdfToEpub } from "./pdf-to-epub.js";
import { createEpubChecker, epubCheckSummary, type EpubCheckResult } from "./epubcheck.js";

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
  epubcheck?: EpubCheckResult;
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
  const args = process.argv.slice(2);
  let checkStandards = false;
  let reportDirectory: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--epubcheck") checkStandards = true;
    else if (argument === "--report-dir" && args[index + 1] && !args[index + 1]!.startsWith("--")) {
      reportDirectory = path.resolve(args[++index]!);
    } else throw new Error("usage: npm run verify:epub -- [--epubcheck [--report-dir NEW_DIRECTORY]]");
  }
  if (reportDirectory && !checkStandards) throw new Error("--report-dir requires --epubcheck");
  // Fail before the expensive conversions if the requested validator is unavailable.
  const checker = checkStandards ? await createEpubChecker() : undefined;
  if (checker) console.log(`Standards validation: EPUBCheck ${checker.version} (warnings fail)`);
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

  // Refuse reuse so old reports cannot masquerade as results from this run.
  if (reportDirectory) await mkdir(reportDirectory, { recursive: false });

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
        const summary: Summary = {
          file: name,
          pages: result.pageCount,
          unresolvedAnnotations: result.unresolvedAnnotationCount,
          bytes: result.byteLength,
        };
        summaries.push(summary);
        if (checker) {
          summary.epubcheck = await checker.check(output, reportDirectory
            ? path.join(reportDirectory, `${index + 1}.epubcheck.json`) : undefined);
          console.log(`  ${epubCheckSummary(summary.epubcheck)}`);
          if (!summary.epubcheck.valid) {
            issues.push({ file: name, detail: epubCheckSummary(summary.epubcheck) });
            for (const message of summary.epubcheck.messages.slice(0, 10)) {
              issues.push({ file: name, detail: `${message.id}: ${message.message}` });
            }
          }
        }
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

  const checked = summaries.filter((summary) => summary.epubcheck?.valid).length;
  if (checker && checked !== EXPECTED_PDF_COUNT) {
    issues.push({ file: SAMPLE_DIRECTORY, detail: `expected ${EXPECTED_PDF_COUNT} EPUBCheck passes but got ${checked}` });
  }
  if (reportDirectory) {
    await writeFile(path.join(reportDirectory, "summary.json"), JSON.stringify({
      passed: issues.length === 0,
      epubcheckVersion: checker!.version,
      expectedPdfs: EXPECTED_PDF_COUNT,
      expectedPages: EXPECTED_TOTAL_PAGES,
      totalPages,
      summaries,
      issues,
    }, null, 2) + "\n", { flag: "wx" });
    console.log(`Reports: ${reportDirectory}`);
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
  if (checker) console.log(`EPUBCheck ${checker.version}: ${checked}/${EXPECTED_PDF_COUNT} passed (0 errors, 0 warnings)`);
  console.log("All corpus PDFs completed end-to-end PDF -> EPUB conversion.");
  console.log(RULE);
}

main().catch((error: unknown) => {
  printFail([{ file: "verifier", detail: error instanceof Error ? error.message : String(error) }], []);
});

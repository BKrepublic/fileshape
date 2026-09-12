import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Browser, type CDPSession, type Page } from "@playwright/test";
import { convertPdfBytesToEpub } from "../src/pdf-to-epub.js";

const MODIFIED = "2026-09-12T10:20:30Z";
const EXPECTED_PDFS = 9;
const EXPECTED_PAGES = 5141;
const EXPECTED_UNRESOLVED = 6387;
const corpusDirectory = path.resolve(process.env.FILESHAPE_PRIVATE_CORPUS_DIR ?? "local-samples");

type PrivateResult = {
  pdfId: string;
  pageCount: number;
  unresolvedAnnotationCount: number;
  epubBytes: number;
  browserElapsedMs: number;
  baselineBrowserRssKiB: number;
  peakBrowserRssKiB: number;
  peakBrowserRssDeltaKiB: number;
};

type StoredZipEntry = {
  path: string;
  data: Buffer;
  uncompressedSize: number;
};

async function listPdfs(): Promise<string[]> {
  const entries = await readdir(corpusDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => path.join(corpusDirectory, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), "en"));
}

function pdfId(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`;
}

function hashPrefix(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

function storedZipEntries(bytes: Buffer): StoredZipEntry[] {
  const entries: StoredZipEntry[] = [];
  let offset = 0;
  while (offset + 4 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    if (offset + 30 > bytes.length) throw new Error("truncated EPUB local ZIP header");
    const method = bytes.readUInt16LE(offset + 8);
    if (method !== 0) throw new Error(`unexpected compressed EPUB entry at byte ${offset}`);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const uncompressedSize = bytes.readUInt32LE(offset + 22);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error("truncated EPUB local ZIP entry");
    entries.push({
      path: bytes.toString("utf8", nameStart, nameEnd),
      data: bytes.subarray(dataStart, dataEnd),
      uncompressedSize,
    });
    offset = dataEnd;
  }
  return entries;
}

function firstDifferentByte(left: Uint8Array, right: Uint8Array): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (left[index] !== right[index]) return index;
  }
  return left.length === right.length ? -1 : sharedLength;
}

function epubDifferenceSummary(nodeBytes: Buffer, browserBytes: Buffer): Record<string, unknown> {
  const nodeEntries = storedZipEntries(nodeBytes);
  const browserEntries = storedZipEntries(browserBytes);
  const sharedEntries = Math.min(nodeEntries.length, browserEntries.length);
  for (let index = 0; index < sharedEntries; index += 1) {
    const node = nodeEntries[index]!;
    const browser = browserEntries[index]!;
    if (node.path !== browser.path) {
      return {
        kind: "entry-path",
        entryIndex: index,
        nodePath: node.path,
        browserPath: browser.path,
        nodeEntryCount: nodeEntries.length,
        browserEntryCount: browserEntries.length,
      };
    }
    if (Buffer.compare(node.data, browser.data) !== 0) {
      return {
        kind: "entry-data",
        entryIndex: index,
        entryPath: node.path,
        nodeBytes: node.data.length,
        browserBytes: browser.data.length,
        nodeUncompressedSize: node.uncompressedSize,
        browserUncompressedSize: browser.uncompressedSize,
        firstDifferingByte: firstDifferentByte(node.data, browser.data),
        nodeSha256: hashPrefix(node.data),
        browserSha256: hashPrefix(browser.data),
      };
    }
  }
  if (nodeEntries.length !== browserEntries.length) {
    return {
      kind: "entry-count",
      nodeEntryCount: nodeEntries.length,
      browserEntryCount: browserEntries.length,
    };
  }
  return {
    kind: "archive-structure",
    nodeBytes: nodeBytes.length,
    browserBytes: browserBytes.length,
    firstDifferingByte: firstDifferentByte(nodeBytes, browserBytes),
    nodeSha256: hashPrefix(nodeBytes),
    browserSha256: hashPrefix(browserBytes),
  };
}

async function expectRuntimeSupported(page: Page): Promise<void> {
  await expect(page.locator("#pdfjs-status")).toHaveText("確認済み", { timeout: 12_000 });
  await expect(page.locator("#binary-runtime-status")).toHaveText("確認済み", { timeout: 12_000 });
  await expect(page.locator("#runtime-badge")).toHaveAttribute("data-state", "supported");
}

async function downloadConversion(page: Page, sourcePath: string, sourceBytes: Buffer): Promise<Buffer> {
  const sourceName = path.basename(sourcePath);
  await page.locator("#pdf-input").setInputFiles({
    name: sourceName,
    mimeType: "application/pdf",
    buffer: sourceBytes,
  });
  const advancedSettings = page.locator("details.advanced-settings");
  if ((await advancedSettings.getAttribute("open")) === null) {
    await advancedSettings.locator("summary").click();
  }
  await page.locator('[name="modified"]').fill(MODIFIED);
  await page.locator('[name="language"]').fill("ja");
  await page.locator('[name="rubyMode"]').selectOption("on");
  await expect(page.locator("#convert-button")).toBeEnabled();
  await page.locator("#convert-button").click();
  await expect(page.locator("#conversion-status")).toContainText("EPUBへ変換しました", { timeout: 1_800_000 });
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-link").click();
  const download = await downloadPromise;
  const expectedName = `${path.parse(sourceName).name}.epub`;
  expect(download.suggestedFilename()).toBe(expectedName);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("browser EPUB download path is unavailable");
  return readFile(downloadPath);
}

async function browserCdp(browser: Browser): Promise<CDPSession> {
  if (process.platform !== "linux") {
    throw new Error("private browser RSS acceptance currently requires Linux /proc");
  }
  return browser.newBrowserCDPSession();
}

async function browserRssKiB(cdp: CDPSession): Promise<number> {
  const response = await cdp.send("SystemInfo.getProcessInfo") as {
    processInfo: Array<{ id: number }>;
  };
  let total = 0;
  for (const processInfo of response.processInfo) {
    try {
      const status = await readFile(`/proc/${processInfo.id}/status`, "utf8");
      const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
      if (match) total += Number(match[1]);
    } catch {
      // A short-lived Chromium process may disappear between CDP enumeration and /proc read.
    }
  }
  return total;
}

async function measureBrowserConversion(
  page: Page,
  cdp: CDPSession,
  sourcePath: string,
  sourceBytes: Buffer,
): Promise<{ bytes: Buffer; elapsedMs: number; baselineRssKiB: number; peakRssKiB: number }> {
  const baselineRssKiB = await browserRssKiB(cdp);
  let peakRssKiB = baselineRssKiB;
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      peakRssKiB = Math.max(peakRssKiB, await browserRssKiB(cdp));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  })();
  const started = performance.now();
  try {
    const bytes = await downloadConversion(page, sourcePath, sourceBytes);
    return {
      bytes,
      elapsedMs: Math.round(performance.now() - started),
      baselineRssKiB,
      peakRssKiB,
    };
  } finally {
    sampling = false;
    await sampler;
  }
}

test("private corpus browser output matches the accepted Node byte API and records Linux RSS", async ({ page, browser }) => {
  test.setTimeout(7_200_000);
  const pdfs = await listPdfs();
  expect(pdfs.length).toBe(EXPECTED_PDFS);

  const requests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await expectRuntimeSupported(page);
  const cdp = await browserCdp(browser);
  const results: PrivateResult[] = [];

  for (const sourcePath of pdfs) {
    const sourceBytes = await readFile(sourcePath);
    const id = pdfId(sourceBytes);
    const sourceName = path.basename(sourcePath);
    const expected = await convertPdfBytesToEpub(new Uint8Array(sourceBytes), sourceName, {
      modified: MODIFIED,
      language: "ja",
      rubyMode: "on",
    });
    const measured = await measureBrowserConversion(page, cdp, sourcePath, sourceBytes);
    const comparison = Buffer.compare(measured.bytes, Buffer.from(expected.bytes));
    if (comparison !== 0) {
      console.log(`PRIVATE_BROWSER_DIFF=${JSON.stringify({
        pdfId: id,
        nodePageCount: expected.pageCount,
        nodeUnresolvedAnnotationCount: expected.unresolvedAnnotationCount,
        nodeEpubBytes: expected.byteLength,
        browserEpubBytes: measured.bytes.length,
        difference: epubDifferenceSummary(Buffer.from(expected.bytes), measured.bytes),
      })}`);
    }
    expect(comparison, `${id} browser EPUB differs from Node bytes`).toBe(0);

    const result: PrivateResult = {
      pdfId: id,
      pageCount: expected.pageCount,
      unresolvedAnnotationCount: expected.unresolvedAnnotationCount,
      epubBytes: expected.byteLength,
      browserElapsedMs: measured.elapsedMs,
      baselineBrowserRssKiB: measured.baselineRssKiB,
      peakBrowserRssKiB: measured.peakRssKiB,
      peakBrowserRssDeltaKiB: Math.max(0, measured.peakRssKiB - measured.baselineRssKiB),
    };
    results.push(result);
    console.log(`PRIVATE_BROWSER_PDF=${JSON.stringify(result)}`);
  }

  const pages = results.reduce((sum, result) => sum + result.pageCount, 0);
  const unresolved = results.reduce((sum, result) => sum + result.unresolvedAnnotationCount, 0);
  expect(pages).toBe(EXPECTED_PAGES);
  expect(unresolved).toBe(EXPECTED_UNRESOLVED);
  expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBeTruthy();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  const reportDirectory = path.resolve("local-reports");
  await mkdir(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, `stage29-browser-private-${Date.now()}.json`);
  await writeFile(reportPath, JSON.stringify({
    pdfs: results.length,
    pages,
    unresolvedAnnotationCount: unresolved,
    allByteIdentical: true,
    results,
  }, null, 2), { flag: "wx" });

  console.log("PRIVATE_BROWSER_ACCEPTANCE=PASS");
  console.log(`PRIVATE_BROWSER_PDFS=${results.length}`);
  console.log(`PRIVATE_BROWSER_PAGES=${pages}`);
  console.log(`PRIVATE_BROWSER_UNRESOLVED=${unresolved}`);
  console.log("PRIVATE_BROWSER_BYTE_IDENTICAL=yes");
  console.log(`PRIVATE_BROWSER_REPORT=${reportPath}`);
});

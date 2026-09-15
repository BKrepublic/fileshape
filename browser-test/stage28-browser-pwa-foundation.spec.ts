import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { convertPdfBytesToEpub } from "../src/pdf-to-epub.js";
import { pdfBytes } from "../test/pdf-fixture.js";
import { imagePdfBytes } from "../test/pdf-image-fixture.js";

const MODIFIED = "2026-09-12T10:20:30Z";

async function expectRuntimeSupported(page: import("@playwright/test").Page): Promise<void> {
  const pdfStatus = page.locator("#pdfjs-status");
  const binaryStatus = page.locator("#binary-runtime-status");
  const badge = page.locator("#runtime-badge");
  const message = page.locator("#runtime-message");
  await expect(pdfStatus).not.toHaveText("確認中…", { timeout: 12_000 });
  await expect(binaryStatus).not.toHaveText("確認中…", { timeout: 12_000 });
  const diagnostic = (await message.textContent()) ?? "runtime probes did not provide a diagnostic";
  expect(await badge.getAttribute("data-state"), diagnostic).toBe("supported");
  await expect(pdfStatus).toHaveText("確認済み");
  await expect(binaryStatus).toHaveText("確認済み");
}

function requestedDownloadName(sourceName: string, override?: string): string {
  if (!override) return sourceName.replace(/\.[^.]+$/, "") + ".epub";
  const safe = override.trim().replace(/[\\/\0]+/g, "-");
  return /\.epub$/i.test(safe) ? safe : `${safe}.epub`;
}

async function convertFixture(
  page: import("@playwright/test").Page,
  fixture: Buffer,
  sourceName: string,
  outputName?: string,
): Promise<Buffer> {
  await page.locator("#pdf-input").setInputFiles({
    name: sourceName,
    mimeType: "application/pdf",
    buffer: fixture,
  });

  // `modified` remains an engine/CLI option for reproducible output, but it is
  // intentionally absent from the end-user UI. Inject it only for this exact-byte test.
  await page.evaluate((modified) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "modified";
    input.value = modified;
    document.body.append(input);
  }, MODIFIED);

  if (outputName) await page.locator('[name="outputName"]').fill(outputName);
  await expect(page.locator("#selected-file")).toContainText(sourceName);
  await expect(page.locator("#convert-button")).toBeEnabled();
  await page.locator("#convert-button").click();
  await expect(page.locator("#conversion-status")).toContainText("EPUBに変換しました", { timeout: 20_000 });
  await expect(page.locator("#download-link")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-link").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(requestedDownloadName(sourceName, outputName));
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("browser EPUB download path is unavailable");
  return readFile(downloadPath);
}

function assertLocalRequests(requests: string[], pageUrl: string, sourceNames: string[]): void {
  expect(requests.every((url) => new URL(url).origin === new URL(pageUrl).origin)).toBeTruthy();
  expect(requests.every((url) => sourceNames.every((sourceName) => !url.includes(sourceName)) && !url.includes("%PDF"))).toBeTruthy();
}

function assertPdfJsResourcesUseApplicationBase(requests: string[], pageUrl: string): void {
  const origin = new URL(pageUrl).origin;
  for (const directory of ["/pdfjs/cmaps/", "/pdfjs/standard_fonts/", "/pdfjs/wasm/", "/pdfjs/iccs/"]) {
    expect(requests.some((request) => {
      const url = new URL(request);
      return url.origin === origin && url.pathname.includes(directory);
    })).toBeTruthy();
  }
  expect(requests.every((request) => !new URL(request).pathname.includes("/assets/pdfjs/"))).toBeTruthy();
}

function trackBrowserDiagnostics(page: import("@playwright/test").Page): {
  consoleErrors: string[];
  pageErrors: string[];
  httpErrors: string[];
  requests: string[];
} {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const httpErrors: string[] = [];
  const requests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
  page.on("request", (request) => requests.push(request.url()));
  return { consoleErrors, pageErrors, httpErrors, requests };
}

test("browser worker converts the public text fixture byte-identically and remains local/offline", async ({ page, context }) => {
  test.setTimeout(60_000);
  const sourceName = "stage29-public.pdf";
  const fixture = pdfBytes();
  const expected = await convertPdfBytesToEpub(new Uint8Array(fixture), sourceName, { modified: MODIFIED });
  const expectedRenamed = await convertPdfBytesToEpub(new Uint8Array(fixture), sourceName, {
    modified: MODIFIED,
    title: "renamed-book",
  });
  const diagnostics = trackBrowserDiagnostics(page);

  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveText("PDFを、ブラウザだけでEPUBに。");
  await expect(page.locator('.file-surface .surface-icon [data-icon="lucide:file-up"]')).toHaveCount(1);
  await expect(page.locator('.file-picker [data-icon="lucide:file-up"]')).toHaveCount(1);
  await expect(page.locator('.workflow-strip [data-icon="lucide:file-up"]')).toHaveCount(1);
  await expect(page.locator(".workflow-strip")).toContainText("PDFを選ぶ");
  await expect(page.locator(".conversion-settings")).toBeVisible();
  await expect(page.locator('[name="outputName"]')).toBeVisible();
  await expect(page.locator('[name="rubyMode"]')).toBeVisible();
  await expect(page.locator('[name="title"]')).toHaveAttribute("type", "hidden");
  await expect(page.locator('[name="creator"]')).toHaveCount(0);
  await expect(page.locator('[name="language"]')).toHaveCount(0);
  await expect(page.locator('[name="modified"]')).toHaveCount(0);
  await expectRuntimeSupported(page);
  await expect(page.locator("#runtime-title")).toContainText("動作環境");
  await expect(page.locator("#runtime-message")).toBeHidden();
  await expect(page.locator("#pwa-status")).toHaveText(/利用可能|準備中/);
  await expect(page.locator("#convert-button")).toBeDisabled();
  await expect(page.locator("#pdf-input")).toHaveAttribute("accept", /pdf/);
  await expect.poll(() => context.serviceWorkers().length).toBeGreaterThan(0);

  // Reload under service-worker control, then perform one online conversion so
  // the conversion worker and its nested PDF.js worker are cached as real app resources.
  await page.reload();
  await expectRuntimeSupported(page);
  const onlineBytes = await convertFixture(page, fixture, sourceName, "renamed-book");
  expect(Buffer.compare(onlineBytes, Buffer.from(expectedRenamed.bytes))).toBe(0);
  assertPdfJsResourcesUseApplicationBase(diagnostics.requests, page.url());

  assertLocalRequests(diagnostics.requests, page.url(), [sourceName]);
  expect(diagnostics.httpErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);

  // The same real conversion must still work with networking disabled.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#page-title")).toHaveText("PDFを、ブラウザだけでEPUBに。");
  await expectRuntimeSupported(page);
  const offlineBytes = await convertFixture(page, fixture, sourceName);
  expect(Buffer.compare(offlineBytes, Buffer.from(expected.bytes))).toBe(0);
  assertPdfJsResourcesUseApplicationBase(diagnostics.requests, page.url());
  await context.setOffline(false);

  expect(diagnostics.httpErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
});

test("browser worker exercises production PNG deflate byte-identically", async ({ page }) => {
  test.setTimeout(60_000);
  const sourceName = "stage29-image.pdf";
  const fixture = imagePdfBytes({ includeInline: false, rotation: 0 });
  const expected = await convertPdfBytesToEpub(new Uint8Array(fixture), sourceName, { modified: MODIFIED });
  const diagnostics = trackBrowserDiagnostics(page);

  await page.goto("/");
  await expectRuntimeSupported(page);
  const browserBytes = await convertFixture(page, fixture, sourceName);
  expect(Buffer.compare(browserBytes, Buffer.from(expected.bytes))).toBe(0);
  assertPdfJsResourcesUseApplicationBase(diagnostics.requests, page.url());
  assertLocalRequests(diagnostics.requests, page.url(), [sourceName]);
  expect(diagnostics.httpErrors).toEqual([]);
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);
});

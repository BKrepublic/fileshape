import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { convertPdfBytesToEpub } from "../src/pdf-to-epub.js";
import { pdfBytes } from "../test/pdf-fixture.js";

const MODIFIED = "2026-09-12T10:20:30Z";
const SOURCE_NAME = "stage29-public.pdf";

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

async function convertFixture(
  page: import("@playwright/test").Page,
  fixture: Buffer,
): Promise<Buffer> {
  await page.locator("#pdf-input").setInputFiles({
    name: SOURCE_NAME,
    mimeType: "application/pdf",
    buffer: fixture,
  });
  await page.locator('[name="modified"]').fill(MODIFIED);
  await expect(page.locator("#selected-file")).toContainText(SOURCE_NAME);
  await expect(page.locator("#convert-button")).toBeEnabled();
  await page.locator("#convert-button").click();
  await expect(page.locator("#conversion-status")).toContainText("EPUBへ変換しました", { timeout: 20_000 });
  await expect(page.locator("#download-link")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-link").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("stage29-public.epub");
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error("browser EPUB download path is unavailable");
  return readFile(downloadPath);
}

test("browser worker converts the public fixture byte-identically and remains local/offline", async ({ page, context }) => {
  test.setTimeout(60_000);
  const fixture = pdfBytes();
  const expected = await convertPdfBytesToEpub(new Uint8Array(fixture), SOURCE_NAME, { modified: MODIFIED });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveText("PDFを、手元でEPUBへ。");
  await expectRuntimeSupported(page);
  await expect(page.locator("#pwa-status")).toHaveText(/利用可能|準備中/);
  await expect(page.locator("#convert-button")).toBeDisabled();
  await expect(page.locator("#pdf-input")).toHaveAttribute("accept", /pdf/);
  await expect.poll(() => context.serviceWorkers().length).toBeGreaterThan(0);

  // Reload under service-worker control, then perform one online conversion so
  // the conversion worker and its nested PDF.js worker are cached as real app resources.
  await page.reload();
  await expectRuntimeSupported(page);
  const onlineBytes = await convertFixture(page, fixture);
  expect(Buffer.compare(onlineBytes, Buffer.from(expected.bytes))).toBe(0);

  expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBeTruthy();
  expect(requests.every((url) => !url.includes(SOURCE_NAME) && !url.includes("%PDF"))).toBeTruthy();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  // The same real conversion must still work with networking disabled.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#page-title")).toHaveText("PDFを、手元でEPUBへ。");
  await expectRuntimeSupported(page);
  const offlineBytes = await convertFixture(page, fixture);
  expect(Buffer.compare(offlineBytes, Buffer.from(expected.bytes))).toBe(0);
  await context.setOffline(false);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

import { expect, test } from "@playwright/test";

test("mobile shell probes a real PDF.js worker and stays local/offline", async ({ page, context }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("/");
  await expect(page.locator("#page-title")).toHaveText("PDFを、手元でEPUBへ。");
  await expect(page.locator("#pdfjs-status")).toHaveText("確認済み", { timeout: 20_000 });
  await expect(page.locator("#runtime-badge")).toHaveAttribute("data-state", "supported");
  await expect(page.locator("#pwa-status")).toHaveText(/利用可能|準備中/);
  await expect(page.locator("#convert-button")).toBeDisabled();
  await expect(page.locator("#pdf-input")).toHaveAttribute("accept", /pdf/);

  await page.locator("#pdf-input").setInputFiles({
    name: "selected.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 local-only fixture"),
  });
  await expect(page.locator("#selected-file")).toContainText("selected.pdf");
  expect(requests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBeTruthy();
  expect(requests.every((url) => !url.includes("%PDF") && !url.includes("selected.pdf"))).toBeTruthy();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);

  await expect.poll(() => context.serviceWorkers().length).toBeGreaterThan(0);
  // Reload once under service-worker control so every module and worker asset
  // used by the shell is cached before the offline navigation.
  await page.reload();
  await expect(page.locator("#pdfjs-status")).toHaveText("確認済み", { timeout: 20_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#page-title")).toHaveText("PDFを、手元でEPUBへ。");
  await expect(page.locator("#convert-button")).toBeDisabled();
  await context.setOffline(false);
});

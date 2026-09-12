import { expect, test } from "@playwright/test";

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

test("mobile shell probes browser runtimes and stays local/offline", async ({ page, context }) => {
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
  await expectRuntimeSupported(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#page-title")).toHaveText("PDFを、手元でEPUBへ。");
  await expectRuntimeSupported(page);
  await expect(page.locator("#convert-button")).toBeDisabled();
  await context.setOffline(false);
});

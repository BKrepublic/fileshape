import { defineConfig } from "@playwright/test";

const localChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim();

export default defineConfig({
  testDir: "./browser-test",
  fullyParallel: false,
  forbidOnly: true,
  timeout: 30_000,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    serviceWorkers: "allow",
    viewport: { width: 360, height: 800 },
    ...(localChromium ? { launchOptions: { executablePath: localChromium } } : {}),
  },
  webServer: {
    command: "npm run preview:browser -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

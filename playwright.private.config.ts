import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-private-test",
  fullyParallel: false,
  forbidOnly: true,
  timeout: 7_200_000,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    serviceWorkers: "allow",
    viewport: { width: 360, height: 800 },
  },
  webServer: {
    command: "npm run preview:browser -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

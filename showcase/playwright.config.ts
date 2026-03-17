import { defineConfig } from "@playwright/test";
import { join } from "path";

export default defineConfig({
  testDir: join(__dirname, "../web/e2e"),
  testMatch: "capture-screenshots.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: "list",
  use: {
    headless: true,
    screenshot: "off",
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});

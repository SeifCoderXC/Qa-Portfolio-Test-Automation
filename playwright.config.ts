import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, defineConfig, devices } from "@playwright/test";

// Dashboard end-to-end tests. Separate from the worker's runner (packages/engine) and `pnpm demo`.
const BASE_URL = "http://127.0.0.1:3000";

// Tests get their own database so they never touch your real projects (data/ is gitignored).
const E2E_DB = resolve(__dirname, "data/e2e/ai-qa.sqlite");

// Use Playwright's Chromium when downloaded (`pnpm browser:install`), else installed Google Chrome.
const channel = existsSync(chromium.executablePath()) ? undefined : "chrome";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel } }],
  webServer: {
    // Same as `pnpm --filter web dev`, but exec'd directly: pnpm 12 starts scripts in their own
    // process group, which Playwright cannot stop, so the run would never exit.
    command:
      "pnpm db:migrate && cd apps/web && exec node node_modules/next/dist/bin/next dev -H 127.0.0.1 -p 3000",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    env: { DATABASE_PATH: E2E_DB, HOSTNAME: "127.0.0.1" },
  },
});

import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for Link's main flows.
 *
 *   npm run test:e2e -w @link/web                 starts the dev server on port 3100
 *   $env:E2E_BASE_URL="https://your-site.vercel.app"; npm run test:e2e -w @link/web
 *                                                 tests a deployed site instead
 *
 * Signed-in tests need a test account: set E2E_EMAIL and E2E_PASSWORD
 * (a confirmed user that holds nothing important). Without them they are skipped.
 */

const PORT = 3100;
const baseURL = process.env.E2E_BASE_URL?.replace(/\/+$/, "") || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Optional: use an installed browser instead of Playwright's download.
        launchOptions: process.env.E2E_CHROME_PATH ? { executablePath: process.env.E2E_CHROME_PATH } : {},
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next dev --port ${PORT}`,
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
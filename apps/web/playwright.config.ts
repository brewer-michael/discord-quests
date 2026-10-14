import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT, serverEnv } from "./e2e/fixtures";

/** Uses a preinstalled Chromium when PW_CHROMIUM_PATH is set (e.g. in a sandbox without downloads). */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], launchOptions: { executablePath } },
      testMatch: /layout\.spec\.ts/,
    },
  ],
  webServer: {
    command: `pnpm exec tsx e2e/seed.ts && pnpm exec next start -p ${PORT}`,
    url: `${BASE_URL}/privacy`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: serverEnv(),
    stdout: "pipe",
  },
});

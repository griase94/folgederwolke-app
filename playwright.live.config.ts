/**
 * UNCOMMITTED — live-capture config for the prod investigation.
 *
 * Points Playwright at the deployed app (no local webServer, no globalSetup,
 * no DB reset). Auth comes from a storageState file (.qa-live/state.json) built
 * from the admin `session` cookie. Run:
 *   pnpm exec playwright test -c playwright.live.config.ts
 */
import { defineConfig } from "@playwright/test";

const BASE =
  process.env["LIVE_BASE_URL"] ?? "https://folgederwolke-app.vercel.app";

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /qa-live-capture\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 25 * 60_000,
  use: {
    baseURL: BASE,
    ignoreHTTPSErrors: true,
  },
});

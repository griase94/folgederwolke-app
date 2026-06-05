/**
 * Playwright config for post-deploy production smoke tests.
 *
 * Used by .github/workflows/post-deploy-smoke.yml. Runs ONLY
 * tests/e2e/post-deploy-smoke.spec.ts against a remote production URL.
 *
 * Differences from the default playwright.config.ts:
 *   - No `webServer` (we're hitting a real, already-deployed instance)
 *   - No globalSetup (no local DB to reset)
 *   - `testMatch` restricts to post-deploy-smoke.spec.ts so a stray test in
 *     tests/e2e/ can never run against production
 *   - `baseURL` resolved from `PLAYWRIGHT_BASE_URL` env var (fail-fast if unset)
 */

import { defineConfig } from "@playwright/test";
import { baseConfig } from "./playwright.config";

const baseUrl = process.env["PLAYWRIGHT_BASE_URL"];
if (!baseUrl) {
  throw new Error(
    "PLAYWRIGHT_BASE_URL env var required for post-deploy Playwright run",
  );
}

export default defineConfig({
  ...baseConfig,
  testMatch: /post-deploy-smoke\.spec\.ts$/,
  // Two attempts handled at the workflow level (sleep 30 between); the spec
  // itself shouldn't auto-retry on transient errors because each retry inside
  // the same attempt would slow down failure detection.
  retries: 0,
  timeout: 30_000,
  use: {
    ...baseConfig.use,
    baseURL: baseUrl,
  },
});

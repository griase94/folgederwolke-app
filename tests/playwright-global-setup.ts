/**
 * Playwright globalSetup — runs ONCE before the webServer boots and tests run.
 * Loads .env.test into process.env (so webServer.env in playwright.config.ts
 * can forward vars), then spawns scripts/db/reset-test-db.sh via execFileSync.
 */

import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

export default async function globalSetup() {
  loadEnv({ path: ".env.test" });

  console.log("[playwright-global-setup] resetting test DB...");
  execFileSync("bash", ["scripts/db/reset-test-db.sh"], { stdio: "inherit" });
}

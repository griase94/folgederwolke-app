/**
 * Vitest globalSetup — runs ONCE before all unit tests in the main process,
 * before any worker fork. Loads .env.test into process.env so DB-touching
 * tests can read DIRECT_DATABASE_URL / DATABASE_URL directly. Then spawns
 * scripts/db/reset-test-db.sh via execFileSync (hardcoded args, no shell
 * injection risk).
 *
 * The shell script independently sources .env.test too — both paths use the
 * same file, so they agree.
 */

import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";

export default function setup() {
  loadEnv({ path: ".env.test" });
  console.log("[vitest-global-setup] resetting test DB...");
  execFileSync("bash", ["scripts/db/reset-test-db.sh"], { stdio: "inherit" });
}

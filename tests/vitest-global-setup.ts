/**
 * Vitest globalSetup — runs ONCE before all unit tests in the main process,
 * before any worker fork. Spawns scripts/db/reset-test-db.sh as a child
 * process via execFileSync (hardcoded args, no shell injection risk).
 * The shell script loads .env.test itself and resets folgederwolke_test.
 */

import { execFileSync } from "node:child_process";

export default function setup() {
  console.log("[vitest-global-setup] resetting test DB...");
  execFileSync("bash", ["scripts/db/reset-test-db.sh"], { stdio: "inherit" });
}

import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Load .env.test at config-load time so webServer.env can forward vars.
// Also load .env.test.local (gitignored, slot-isolated worktree overrides like
// DATABASE_URL=…_slot1) with `override: true` so a per-worktree slot wins
// over the default. Without this, test code reads the default DATABASE_URL
// from .env.test while the webServer runs against the slot, and signIn()
// inserts magic-link rows into the wrong DB.
loadEnv({ path: ".env.test" });
// Per-slot worktree isolation (Pre-Flight Task 0.9): if .env.test.local sets
// PORT/ORIGIN/DATABASE_URL, load those on top so parallel worktrees don't
// collide on shared docker port 15432 + webserver 4173.
loadEnv({ path: ".env.test.local", override: true });

const PORT = process.env["PORT"] ?? "4173";
const ORIGIN = process.env["ORIGIN"] ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  globalSetup: "./tests/playwright-global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // `server.js` is a thin custom Node entry that wraps adapter-node's
    // compiled handler and normalises the `Origin` header for the PWA
    // share_target POST so SvelteKit's CSRF check doesn't drop legitimate
    // Android intents. See server.js header comment for the safety argument.
    command: "node server.js",
    port: Number(PORT),
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // .env.test + .env.test.local loaded by dotenv at top; we forward
      // process.env into the spawned node server so it sees all the vars
      // the SvelteKit app reads via $env/dynamic/private. Per-slot
      // PORT/ORIGIN overrides come from .env.test.local in parallel worktrees.
      ...process.env,
      PORT,
      HOST: "127.0.0.1",
      // ORIGIN: SvelteKit adapter-node's CSRF check rejects form POSTs whose
      // Origin header doesn't match url.origin. Without this, adapter-node
      // defaults to https:// (parse_origin guesses from PROTOCOL_HEADER ||
      // 'https'), making url.origin = 'https://127.0.0.1:4173', while the
      // browser sends 'http://127.0.0.1:4173' → 403. Set ORIGIN explicitly.
      ORIGIN,
      // Bescheid config so isBescheinigungEnabled()=true for e2e — makes the
      // Zuwendungsbestätigung happy-path (Werkstatt round-trip → issue → PDF)
      // exercisable end-to-end. Unit/integration tests are unaffected (they
      // don't use this webServer; the bescheid integration tests set their own
      // process.env). Matches the .env.test Finanzamt/Zwecke already present.
      VEREIN_BESCHEID_TYP: "freistellungsbescheid",
      VEREIN_BESCHEID_DATUM: "2025-02-04",
      VEREIN_FREISTELLUNGSBESCHEID_VZ: "2024",
    },
  },
});

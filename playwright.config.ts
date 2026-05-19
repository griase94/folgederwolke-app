import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Load .env.test at config-load time so webServer.env can forward vars
loadEnv({ path: ".env.test" });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  globalSetup: "./tests/playwright-global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
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
    command: "node build/index.js",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // .env.test is loaded by dotenv at the top of this file; we forward
      // process.env into the spawned node server so it sees all the vars
      // the SvelteKit app reads via $env/dynamic/private. Explicit overrides
      // for the dev-server-specific port/host/origin follow.
      ...process.env,
      PORT: "4173",
      HOST: "127.0.0.1",
      // ORIGIN: SvelteKit adapter-node's CSRF check rejects form POSTs whose
      // Origin header doesn't match url.origin. Without this, adapter-node
      // defaults to https:// (parse_origin guesses from PROTOCOL_HEADER ||
      // 'https'), making url.origin = 'https://127.0.0.1:4173', while the
      // browser sends 'http://127.0.0.1:4173' → 403. Set ORIGIN explicitly.
      ORIGIN: "http://127.0.0.1:4173",
    },
  },
});

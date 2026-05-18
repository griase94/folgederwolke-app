import { defineConfig, devices } from "@playwright/test";

// CI debug: log which env vars are present when playwright loads this config.
// Helps diagnose secrets propagation issues. Safe — only logs presence (not values).
if (process.env.CI) {
  const keys = [
    "DATABASE_URL",
    "DIRECT_DATABASE_URL",
    "SESSION_SECRET",
    "GOOGLE_OAUTH_CLIENT_ID",
    "SMTP_HOST",
  ];
  console.log(
    "[playwright.config] env presence:",
    Object.fromEntries(keys.map((k) => [k, !!process.env[k]])),
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
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
    // Build via pnpm (cached deps), then start node directly — bypasses pnpm's
    // env handling which was dropping our forwarded vars in CI. PORT/HOST are
    // inline so the server binds to 4173 on localhost (matching baseURL).
    command: "pnpm build && PORT=4173 HOST=127.0.0.1 node ./build/index.js",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

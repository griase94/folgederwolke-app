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
    // Inline `$VAR` expansion forces env-passing even when playwright's
    // spawn drops process.env (observed in CI). The bash -c invocation makes
    // expansion explicit (sh on some distros doesn't do as much).
    command:
      'bash -c \'pnpm build && PORT=4173 HOST=127.0.0.1 DATABASE_URL="$DATABASE_URL" DIRECT_DATABASE_URL="$DIRECT_DATABASE_URL" SESSION_SECRET="$SESSION_SECRET" ADMIN_EMAILS="$ADMIN_EMAILS" MAIL_PROVIDER="$MAIL_PROVIDER" MAIL_FROM="$MAIL_FROM" SMTP_HOST="$SMTP_HOST" SMTP_PORT="$SMTP_PORT" SMTP_USER="$SMTP_USER" SMTP_PASSWORD="$SMTP_PASSWORD" GOOGLE_OAUTH_CLIENT_ID="$GOOGLE_OAUTH_CLIENT_ID" GOOGLE_OAUTH_CLIENT_SECRET="$GOOGLE_OAUTH_CLIENT_SECRET" GOOGLE_OAUTH_REFRESH_TOKEN="$GOOGLE_OAUTH_REFRESH_TOKEN" DRIVE_PARENT_FOLDER_ID="$DRIVE_PARENT_FOLDER_ID" TEMPLATE_DOC_ID="$TEMPLATE_DOC_ID" PUBLIC_FORM_ENABLED="${PUBLIC_FORM_ENABLED:-true}" VEREIN_NAME="${VEREIN_NAME:-Folge der Wolke e.V.}" VEREIN_STEUERNUMMER="$VEREIN_STEUERNUMMER" VEREIN_VR="$VEREIN_VR" VEREIN_ADRESSE="$VEREIN_ADRESSE" node ./build/index.js\'',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

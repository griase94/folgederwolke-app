import { defineConfig, devices } from "@playwright/test";

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
    command: "pnpm build && pnpm preview",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
    // Propagate runtime env to the spawned node build/index.js. Playwright
    // inherits process.env by default but pnpm scripts can be lossy, so we
    // forward the keys our routes actually need explicitly.
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL ?? "",
      SESSION_SECRET:
        process.env.SESSION_SECRET ??
        "test-session-secret-for-e2e-only-32chars",
      ADMIN_EMAILS: process.env.ADMIN_EMAILS ?? "andy.griesbeck@gmail.com",
      MAIL_PROVIDER: process.env.MAIL_PROVIDER ?? "smtp",
      MAIL_FROM: process.env.MAIL_FROM ?? "noreply@example.com",
      SMTP_HOST: process.env.SMTP_HOST ?? "",
      SMTP_PORT: process.env.SMTP_PORT ?? "587",
      SMTP_USER: process.env.SMTP_USER ?? "",
      SMTP_PASSWORD: process.env.SMTP_PASSWORD ?? "",
      GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      GOOGLE_OAUTH_REFRESH_TOKEN: process.env.GOOGLE_OAUTH_REFRESH_TOKEN ?? "",
      DRIVE_PARENT_FOLDER_ID: process.env.DRIVE_PARENT_FOLDER_ID ?? "",
      TEMPLATE_DOC_ID: process.env.TEMPLATE_DOC_ID ?? "",
      PUBLIC_FORM_ENABLED: process.env.PUBLIC_FORM_ENABLED ?? "true",
      VEREIN_NAME: process.env.VEREIN_NAME ?? "Folge der Wolke e.V.",
      VEREIN_STEUERNUMMER: process.env.VEREIN_STEUERNUMMER ?? "",
      VEREIN_VR: process.env.VEREIN_VR ?? "",
      VEREIN_ADRESSE: process.env.VEREIN_ADRESSE ?? "",
      // Stub Drive + Mail providers so the e2e doesn't reach real APIs
      MAIL_TEST_MODE: "stub",
    },
  },
});

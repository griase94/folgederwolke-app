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
      DATABASE_URL: process.env.DATABASE_URL!,
      DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL!,
      SESSION_SECRET: process.env.SESSION_SECRET!,
      STORAGE_BACKEND: process.env.STORAGE_BACKEND!,
      FILE_STORAGE_ROOT: process.env.FILE_STORAGE_ROOT!,
      MAIL_PROVIDER: process.env.MAIL_PROVIDER!,
      MAIL_FROM: process.env.MAIL_FROM!,
      ADMIN_EMAILS: process.env.ADMIN_EMAILS!,
      PUBLIC_FORM_ENABLED: process.env.PUBLIC_FORM_ENABLED!,
      VEREIN_NAME: process.env.VEREIN_NAME!,
      VEREIN_STEUERNUMMER: process.env.VEREIN_STEUERNUMMER!,
      VEREIN_VR: process.env.VEREIN_VR!,
      VEREIN_ADRESSE: process.env.VEREIN_ADRESSE!,
      PORT: "4173",
      HOST: "127.0.0.1",
      ORIGIN: "http://127.0.0.1:4173",
    },
  },
});

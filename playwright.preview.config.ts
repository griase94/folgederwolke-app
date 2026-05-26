import { defineConfig } from "@playwright/test";
import { baseConfig } from "./playwright.config";

const previewUrl = process.env.PREVIEW_URL;
if (!previewUrl) {
  throw new Error("PREVIEW_URL env var required for preview Playwright run");
}

export default defineConfig({
  ...baseConfig,
  testMatch: /preview-smoke\.spec\.ts$/,
  retries: 3,
  timeout: 60_000,
  use: {
    ...baseConfig.use,
    baseURL: previewUrl,
    extraHTTPHeaders: process.env.VERCEL_PROTECTION_BYPASS
      ? { "x-vercel-protection-bypass": process.env.VERCEL_PROTECTION_BYPASS }
      : undefined,
  },
});

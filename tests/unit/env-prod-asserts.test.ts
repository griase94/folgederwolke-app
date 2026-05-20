// @vitest-environment node
/**
 * @phase-9
 *
 * Phase 9 additions to assertProductionEnvSafe():
 *  - STORAGE_BACKEND=local-fs throws in production (ephemeral FS on Vercel)
 *  - STORAGE_BACKEND=blob without BLOB_READ_WRITE_TOKEN throws
 *  - missing GOOGLE_SERVICE_ACCOUNT_KEY_JSON throws (Drive auth would fail)
 *
 * Each test re-establishes the baseline production environment from scratch
 * (valid mail provider, session secret, base URL, IBAN/BIC) so the assertion
 * under test is the FIRST one that fails. Without this, the .env.test
 * defaults (MAIL_PROVIDER=no-op, short SESSION_SECRET) would short-circuit
 * the prod assertions before we get to the Phase-9 checks.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

function setProdBaseline() {
  process.env.NODE_ENV = "production";
  process.env.MAIL_PROVIDER = "smtp";
  process.env.SESSION_SECRET =
    "long-enough-test-session-secret-1234567890abcdefghij";
  process.env.PUBLIC_BASE_URL = "https://example.test";
  // Bank consistency check is no-op for unknown BLZs; leave defaults.
  process.env.VEREIN_IBAN = "";
  process.env.VEREIN_BIC = "";
}

describe("assertProductionEnvSafe Phase 9 additions", () => {
  beforeEach(() => {
    vi.resetModules();
    setProdBaseline();
  });

  it("local-fs in production throws", async () => {
    process.env.STORAGE_BACKEND = "local-fs";
    process.env.BLOB_READ_WRITE_TOKEN = "x";
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON = JSON.stringify({
      client_email: "x",
      private_key: "x",
    });
    const { assertProductionEnvSafe } = await import("$lib/server/env");
    expect(() => assertProductionEnvSafe()).toThrow(/local-fs is dev-only/);
  });

  it("blob backend with no token in production throws", async () => {
    process.env.STORAGE_BACKEND = "blob";
    process.env.BLOB_READ_WRITE_TOKEN = "";
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON = JSON.stringify({
      client_email: "x",
      private_key: "x",
    });
    const { assertProductionEnvSafe } = await import("$lib/server/env");
    expect(() => assertProductionEnvSafe()).toThrow(/BLOB_READ_WRITE_TOKEN/);
  });

  it("missing SA JSON in production throws", async () => {
    process.env.STORAGE_BACKEND = "blob";
    process.env.BLOB_READ_WRITE_TOKEN = "x";
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON = "";
    const { assertProductionEnvSafe } = await import("$lib/server/env");
    expect(() => assertProductionEnvSafe()).toThrow(
      /GOOGLE_SERVICE_ACCOUNT_KEY_JSON/,
    );
  });
});

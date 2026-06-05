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
  // White-label Phase 4: VEREIN_NAME + MAIL_FROM are now required in prod
  // (asserted at the end of assertProductionEnvSafe). Set them in the
  // baseline so the EARLIER assertions (Phase-9 checks) are the first to
  // fail — otherwise these new checks would short-circuit the others.
  process.env.VEREIN_NAME = "Verein X e.V.";
  process.env.MAIL_FROM = "noreply@verein-x.de";
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

/**
 * White-label Phase 4 (Task 4.1): VEREIN_NAME + MAIL_FROM must be set in
 * production. Enforced prod-side in assertProductionEnvSafe() (appended AFTER
 * the Phase-9 checks), never via Zod `.min(1)` (which would throw at module
 * load and break the CI build with an empty env).
 *
 * These tests set a FULLY-VALID prod baseline (storage + Drive configured) so
 * the only thing that can fail is the white-label check under test.
 */
describe("assertProductionEnvSafe white-label required vars", () => {
  function setFullProdBaseline() {
    setProdBaseline();
    process.env.STORAGE_BACKEND = "blob";
    process.env.BLOB_READ_WRITE_TOKEN = "x";
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON = JSON.stringify({
      client_email: "x",
      private_key: "x",
    });
  }

  beforeEach(() => {
    vi.resetModules();
    setFullProdBaseline();
  });

  it("missing VEREIN_NAME in production throws, naming the var", async () => {
    process.env.VEREIN_NAME = "";
    const { assertProductionEnvSafe } = await import("$lib/server/env");
    expect(() => assertProductionEnvSafe()).toThrow(/VEREIN_NAME/);
  });

  it("whitespace-only VEREIN_NAME in production throws, naming the var", async () => {
    process.env.VEREIN_NAME = "   ";
    const { assertProductionEnvSafe } = await import("$lib/server/env");
    expect(() => assertProductionEnvSafe()).toThrow(/VEREIN_NAME/);
  });

  it("missing MAIL_FROM in production throws, naming the var", async () => {
    process.env.MAIL_FROM = "";
    const { assertProductionEnvSafe } = await import("$lib/server/env");
    expect(() => assertProductionEnvSafe()).toThrow(/MAIL_FROM/);
  });

  it("a complete prod baseline does not throw", async () => {
    const { assertProductionEnvSafe } = await import("$lib/server/env");
    expect(() => assertProductionEnvSafe()).not.toThrow();
  });
});

// @vitest-environment node
/**
 * @phase-9
 *
 * Phase 9 — env.ts must parse GOOGLE_SERVICE_ACCOUNT_KEY_JSON into a
 * structured `googleServiceAccount` object, AND ensure the raw JSON string
 * (which contains the SA private key) is NOT enumerable on the exported
 * `env` object. This is the safety net for accidental log/error JSON
 * dumps that include `env`: the private-key material must not appear in
 * `JSON.stringify(env)`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("env GOOGLE_SERVICE_ACCOUNT_KEY_JSON safety", () => {
  beforeEach(() => vi.resetModules());

  it("JSON.stringify(env) does not include the raw private key", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON = JSON.stringify({
      type: "service_account",
      client_email: "test@test.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n",
    });
    const { env } = await import("$lib/server/env");
    expect(JSON.stringify(env)).not.toContain("FAKE");
    expect(env.googleServiceAccount?.clientEmail).toBe(
      "test@test.iam.gserviceaccount.com",
    );
  });
});

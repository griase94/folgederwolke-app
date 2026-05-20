// @vitest-environment node
/**
 * @phase-9
 *
 * Phase 9 — getDriveAuth() must return a `GoogleAuth` instance built from
 * the parsed service-account JSON (env.googleServiceAccount). The previous
 * OAuth2Client/refresh-token path is gone.
 */
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON = JSON.stringify({
    type: "service_account",
    client_email: "test@test.iam.gserviceaccount.com",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n",
  });
});

describe("drive auth — service account", () => {
  it("returns GoogleAuth", async () => {
    const { getDriveAuth } = await import("$lib/server/drive/auth");
    expect(getDriveAuth().constructor.name).toBe("GoogleAuth");
  });
});

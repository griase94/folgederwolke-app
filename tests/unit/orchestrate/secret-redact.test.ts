import { describe, expect, it } from "vitest";
import { redact } from "../../../scripts/orchestrate/secret-redact.js";

describe("redact", () => {
  it("masks Bearer tokens", () => {
    expect(redact("Authorization: Bearer abc123xyz_-")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
  });
  it("masks IBAN-shaped strings", () => {
    expect(redact("IBAN DE89370400440532013000 on file")).toBe(
      "IBAN [REDACTED-IBAN] on file",
    );
  });
  it("masks age recipient public keys", () => {
    expect(redact("AGE=age1xyz0qwerty1234")).toMatch(/AGE=\[REDACTED-AGE\]/);
  });
  it("masks Google OAuth tokens", () => {
    expect(redact("token=ya29.aBcDe_fGhIjK")).toBe("token=[REDACTED-OAUTH]");
  });
  it("masks GitHub PATs (both shapes)", () => {
    expect(redact("TOKEN=glpat-abc_DEF123xyz")).toContain("[REDACTED-PAT]");
    expect(redact("TOKEN=github_pat_11ABCDEFGH0_abc")).toContain(
      "[REDACTED-PAT]",
    );
  });
  it("leaves harmless text alone", () => {
    expect(redact("Build agent C4 finished in 42s")).toBe(
      "Build agent C4 finished in 42s",
    );
  });
  it("redacts Neon production URLs", () => {
    expect(
      redact("DATABASE_URL=postgres://u:p@ep-x.eu-central-1.aws.neon.tech/db"),
    ).toContain("[REDACTED-NEON]");
  });
});

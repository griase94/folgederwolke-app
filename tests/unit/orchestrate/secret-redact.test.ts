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
    ).toMatch(/\[REDACTED-NEON/);
  });
  it("redacts FULL Neon URL including embedded user:password (B1)", () => {
    const line =
      "DATABASE_URL=postgres://neondb_owner:npg_real_password_xyz@ep-cool-foo-12345678.eu-central-1.aws.neon.tech/neondb";
    const r = redact(line);
    // The real password must NOT remain in the output.
    expect(r).not.toContain("npg_real_password_xyz");
    expect(r).not.toContain("neondb_owner");
    expect(r).toContain("[REDACTED-NEON-URL]");
  });
  it("redacts credentials from any postgres:// URL while keeping host (B1)", () => {
    const line =
      "url=postgres://app_runtime:secretpw@db.internal/folgederwolke";
    const r = redact(line);
    expect(r).not.toContain("secretpw");
    expect(r).not.toContain("app_runtime");
    expect(r).toContain("[REDACTED-DB-CREDS]");
    // host should still be visible so logs tell us which DB
    expect(r).toContain("db.internal");
  });
  it("also handles postgresql:// scheme (B1)", () => {
    const line =
      "DATABASE_URL=postgresql://user:hunter2@some-host.example.com:5432/mydb";
    const r = redact(line);
    expect(r).not.toContain("hunter2");
    expect(r).toContain("[REDACTED-DB-CREDS]");
    expect(r).toContain("some-host.example.com");
  });
  it("redacts FULL JWT-style Bearer token, not just first segment (B1)", () => {
    const line = "Authorization: Bearer aaa.bbb.ccc-base64stuff trailing-text";
    const r = redact(line);
    expect(r).not.toContain("bbb");
    expect(r).not.toContain("ccc-base64stuff");
    expect(r).toContain("Bearer [REDACTED]");
  });
  it("redacts ya29 OAuth tokens with dots in payload (B1)", () => {
    const line = "token=ya29.aBcDe_fGhIjK.signaturePartXYZ";
    const r = redact(line);
    expect(r).not.toContain("signaturePartXYZ");
    expect(r).toContain("[REDACTED-OAUTH]");
  });
});

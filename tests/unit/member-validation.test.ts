/**
 * C5-MEM-full Night-2 — Mitglieder Zod schema extensions.
 *
 * The base `validateAddMember` / `validateEditMember` helpers now accept:
 *   - `role` values `"extern"` and `"helfer"` (in addition to the
 *     Night-1 set vorstand/kassenwart/schriftfuehrer/mitglied/fördermitglied).
 *   - `beitrag_exempt` (boolean, coerced from `"on"` checkbox value or
 *     direct true/false) defaulting to `false`.
 *   - `beitrag_exempt_reason` (optional free text, max 500 chars).
 *
 * Validation MUST coerce HTML form input shapes:
 *   - Unchecked checkbox → key absent → exempt = false.
 *   - Checked checkbox  → value = "on" → exempt = true.
 *   - Empty reason text → null after normalisation.
 */

import { describe, expect, it } from "vitest";
import {
  validateAddMember,
  validateEditMember,
} from "$lib/server/domain/members.js";

const baseInput = {
  vorname: "Test",
  nachname: "Mitglied",
  email: "test@example.org",
  eintritts_datum: "2026-05-21",
};

describe("validateAddMember — Night-2 role + exempt extensions", () => {
  it("accepts role='extern'", () => {
    const r = validateAddMember({ ...baseInput, role: "extern" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe("extern");
  });

  it("accepts role='helfer'", () => {
    const r = validateAddMember({ ...baseInput, role: "helfer" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe("helfer");
  });

  it("rejects unknown role values", () => {
    const r = validateAddMember({ ...baseInput, role: "irgendwas" });
    expect(r.success).toBe(false);
  });

  it("defaults beitrag_exempt to false when key absent", () => {
    const r = validateAddMember({ ...baseInput });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.beitrag_exempt).toBe(false);
  });

  it("coerces 'on' checkbox value to true", () => {
    const r = validateAddMember({ ...baseInput, beitrag_exempt: "on" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.beitrag_exempt).toBe(true);
  });

  it("accepts direct boolean true (programmatic call)", () => {
    const r = validateAddMember({ ...baseInput, beitrag_exempt: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.beitrag_exempt).toBe(true);
  });

  it("accepts beitrag_exempt_reason as free text", () => {
    const r = validateAddMember({
      ...baseInput,
      beitrag_exempt: "on",
      beitrag_exempt_reason: "Ehrenmitglied seit 2020",
    });
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data.beitrag_exempt_reason).toBe("Ehrenmitglied seit 2020");
  });

  it("normalises empty beitrag_exempt_reason to undefined", () => {
    const r = validateAddMember({
      ...baseInput,
      beitrag_exempt: "on",
      beitrag_exempt_reason: "",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.beitrag_exempt_reason).toBeUndefined();
  });
});

describe("validateEditMember — Night-2 role + exempt extensions", () => {
  const editBase = {
    ...baseInput,
    // Valid v4 UUID per RFC 4122 — third group starts with `4`, fourth with 8/9/a/b.
    id: "10000000-0000-4000-8000-000000000001",
  };

  it("accepts role='helfer' on edit", () => {
    const r = validateEditMember({ ...editBase, role: "helfer" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe("helfer");
  });

  it("accepts beitrag_exempt + reason on edit", () => {
    const r = validateEditMember({
      ...editBase,
      beitrag_exempt: "on",
      beitrag_exempt_reason: "Härtefall 2026",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.beitrag_exempt).toBe(true);
      expect(r.data.beitrag_exempt_reason).toBe("Härtefall 2026");
    }
  });
});

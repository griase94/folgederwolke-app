/**
 * @vitest-environment node
 * @phase-3
 */
import { describe, it, expect } from "vitest";
import {
  validateAddMember,
  validateEditMember,
  beitragStatusFor,
  beitragYearsRange,
} from "./members.js";

// ---------------------------------------------------------------------------
// beitragYearsRange
// ---------------------------------------------------------------------------

describe("beitragYearsRange", () => {
  it("returns a 3-element tuple ending with the current year", () => {
    const years = beitragYearsRange();
    const current = new Date().getFullYear();
    expect(years).toHaveLength(3);
    expect(years[2]).toBe(current);
    expect(years[1]).toBe(current - 1);
    expect(years[0]).toBe(current - 2);
  });
});

// ---------------------------------------------------------------------------
// beitragStatusFor
// ---------------------------------------------------------------------------

describe("beitragStatusFor", () => {
  it("returns paid when paidCents >= betragCents (> 0)", () => {
    expect(beitragStatusFor({ betragCents: 6969n, paidCents: 6969n })).toBe(
      "paid",
    );
    expect(beitragStatusFor({ betragCents: 6969n, paidCents: 7000n })).toBe(
      "paid",
    );
  });

  it("returns open when paidCents < betragCents", () => {
    expect(beitragStatusFor({ betragCents: 6969n, paidCents: 0n })).toBe(
      "open",
    );
    expect(beitragStatusFor({ betragCents: 6969n, paidCents: 1000n })).toBe(
      "open",
    );
  });

  it("returns waived when betragCents is 0", () => {
    expect(beitragStatusFor({ betragCents: 0n, paidCents: 0n })).toBe("waived");
  });

  it("accepts number inputs as well as bigint", () => {
    expect(beitragStatusFor({ betragCents: 6969, paidCents: 6969 })).toBe(
      "paid",
    );
    expect(beitragStatusFor({ betragCents: 6969, paidCents: 0 })).toBe("open");
  });
});

// ---------------------------------------------------------------------------
// validateAddMember
// ---------------------------------------------------------------------------

describe("validateAddMember", () => {
  const valid = {
    vorname: "Maria",
    nachname: "Muster",
    email: "maria@example.com",
    eintritts_datum: "2024-01-15",
  };

  it("returns success for minimal valid input", () => {
    const result = validateAddMember({
      vorname: "Max",
      nachname: "Mustermann",
    });
    expect(result.success).toBe(true);
  });

  it("returns success for complete valid input", () => {
    const result = validateAddMember(valid);
    expect(result.success).toBe(true);
  });

  it("fails when vorname is missing", () => {
    const result = validateAddMember({ ...valid, vorname: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveProperty("vorname");
    }
  });

  it("fails when nachname is missing", () => {
    const result = validateAddMember({ ...valid, nachname: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveProperty("nachname");
    }
  });

  it("fails when email is malformed", () => {
    const result = validateAddMember({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveProperty("email");
    }
  });

  it("accepts empty string email (optional)", () => {
    const result = validateAddMember({ ...valid, email: "" });
    expect(result.success).toBe(true);
  });

  it("defaults eintritts_datum to today when omitted", () => {
    const result = validateAddMember({ vorname: "X", nachname: "Y" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eintritts_datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

// ---------------------------------------------------------------------------
// validateEditMember
// ---------------------------------------------------------------------------

describe("validateEditMember", () => {
  // Valid UUID v4 (version nibble 4, variant nibble [89ab])
  const validEdit = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    vorname: "Maria",
    nachname: "Muster",
  };

  it("returns success for valid edit input", () => {
    const result = validateEditMember(validEdit);
    expect(result.success).toBe(true);
  });

  it("fails when id is missing", () => {
    const result = validateEditMember({ vorname: "X", nachname: "Y" });
    expect(result.success).toBe(false);
  });

  it("fails when id is not a UUID", () => {
    const result = validateEditMember({ ...validEdit, id: "not-a-uuid" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveProperty("id");
    }
  });
});

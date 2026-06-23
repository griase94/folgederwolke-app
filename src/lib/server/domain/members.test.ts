/**
 * @vitest-environment node
 * @phase-3
 */
import { describe, it, expect } from "vitest";
import {
  validateAddMember,
  validateEditMember,
  beitragYearsRange,
} from "./members.js";
import { currentBuchungsjahr } from "$lib/domain/year.js";

// ---------------------------------------------------------------------------
// beitragYearsRange
// ---------------------------------------------------------------------------

describe("beitragYearsRange", () => {
  it("clamps the default window to end at the current year — no future column (F8)", () => {
    const years = beitragYearsRange();
    // Oracle uses currentBuchungsjahr() (Berlin TZ) to match the implementation,
    // avoiding a UTC↔Berlin New-Year boundary flake on a UTC CI runner.
    const current = currentBuchungsjahr();
    expect(years).toHaveLength(3);
    // Upper bound clamped to the current Buchungsjahr: no anchor+1 future cell.
    expect(years[0]).toBe(current - 2);
    expect(years[1]).toBe(current - 1);
    expect(years[2]).toBe(current);
  });

  it("keeps a past anchor centered ([anchor-1, anchor, anchor+1]) when it stays <= current (C2-2)", () => {
    // 2024 is in the past relative to any plausible CI run year, so anchor+1
    // (2025) is still <= the current Buchungsjahr → window stays centered.
    const years = beitragYearsRange(2024);
    expect(years).toEqual([2023, 2024, 2025]);
  });

  it("never includes a year beyond the current Buchungsjahr (F8)", () => {
    const current = currentBuchungsjahr();
    // A future anchor must not surface a future column either.
    const years = beitragYearsRange(current + 5);
    expect(Math.max(...years)).toBeLessThanOrEqual(current);
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

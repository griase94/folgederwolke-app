import { describe, it, expect } from "vitest";
import { isUuid, assertUuidOr404 } from "./uuid.js";

describe("isUuid", () => {
  it("accepts a canonical lowercase UUID", () => {
    expect(isUuid("04842fef-1234-4abc-89de-0123456789ab")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isUuid("04842FEF-1234-4ABC-89DE-0123456789AB")).toBe(true);
  });

  it("rejects a human-readable business id (the F12/F13 bug input)", () => {
    expect(isUuid("FDW-2026-003")).toBe(false);
  });

  it("rejects garbage / partial / empty", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("04842fef-1234-4abc-89de")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

describe("assertUuidOr404", () => {
  it("returns the id unchanged for a valid UUID", () => {
    const id = "04842fef-1234-4abc-89de-0123456789ab";
    expect(assertUuidOr404(id)).toBe(id);
  });

  it("throws a 404 HttpError for a non-UUID", () => {
    // SvelteKit's error() throws an object with a numeric `status`.
    expect(() => assertUuidOr404("FDW-2026-003")).toThrow();
    try {
      assertUuidOr404("FDW-2026-003", "Rechnung nicht gefunden");
    } catch (e) {
      const err = e as { status?: number; body?: { message?: string } };
      expect(err.status).toBe(404);
      expect(err.body?.message).toBe("Rechnung nicht gefunden");
    }
  });
});

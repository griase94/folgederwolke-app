/**
 * Customer structured-address validation (Andy-Feedback 2026-07). The Zod
 * schema makes Straße/PLZ/Ort MANDATORY, Adresszusatz optional, and Land a
 * free-text field (default "Deutschland"). The German 5-digit PLZ rule is
 * enforced only when Land is Deutschland (AT/CH keep their own formats).
 */
import { describe, expect, it } from "vitest";
import {
  validateAddCustomer,
  validateEditCustomer,
} from "../../src/lib/server/domain/customers.js";

const OK = {
  name: "Cremosa GmbH",
  strasse: "Maximilianstraße 12",
  plz: "80539",
  ort: "München",
  land: "Deutschland",
};

describe("validateAddCustomer — structured address", () => {
  it("accepts a complete German address (Land defaults to Deutschland)", () => {
    const r = validateAddCustomer({
      name: "X",
      strasse: "A 1",
      plz: "80331",
      ort: "München",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.strasse).toBe("A 1");
      expect(r.data.land).toBe("Deutschland");
      expect(r.data.adresszusatz).toBeUndefined();
    }
  });

  it("keeps an optional Adresszusatz when provided", () => {
    const r = validateAddCustomer({
      ...OK,
      adresszusatz: "z. Hd. Frau Müller",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.adresszusatz).toBe("z. Hd. Frau Müller");
  });

  it("rejects a missing Straße / PLZ / Ort with German errors", () => {
    const r = validateAddCustomer({ name: "X" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.errors.strasse?.[0]).toMatch(/Straße/i);
      expect(r.errors.plz?.[0]).toMatch(/PLZ/i);
      expect(r.errors.ort?.[0]).toMatch(/Ort/i);
    }
  });

  it("rejects a non-5-digit PLZ for a German customer", () => {
    for (const plz of ["8053", "805390", "8053a", "ABCDE"]) {
      const r = validateAddCustomer({ ...OK, plz });
      expect(r.success, `plz=${plz}`).toBe(false);
      if (!r.success) expect(r.errors.plz?.[0]).toMatch(/5 Ziffern/i);
    }
  });

  it("allows a 4-digit PLZ for a non-German (AT) customer", () => {
    const r = validateAddCustomer({
      ...OK,
      land: "Österreich",
      plz: "1010",
      ort: "Wien",
    });
    expect(r.success).toBe(true);
  });

  it("treats Land case-insensitively for the DE PLZ rule", () => {
    // "deutschland" lower-case still triggers the 5-digit check.
    const r = validateAddCustomer({ ...OK, land: "deutschland", plz: "123" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.plz?.[0]).toMatch(/5 Ziffern/i);
  });

  it("trims the structured parts", () => {
    const r = validateAddCustomer({
      ...OK,
      strasse: "  Florastraße 84 ",
      ort: " Berlin ",
      plz: "13187",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.strasse).toBe("Florastraße 84");
      expect(r.data.ort).toBe("Berlin");
    }
  });
});

describe("validateEditCustomer — structured address", () => {
  it("carries the same address rules plus the id", () => {
    const r = validateEditCustomer({
      id: "11111111-1111-4111-8111-111111111111",
      ...OK,
    });
    expect(r.success).toBe(true);
  });

  it("still rejects a bad German PLZ on edit", () => {
    const r = validateEditCustomer({
      id: "11111111-1111-4111-8111-111111111111",
      ...OK,
      plz: "123",
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.plz?.[0]).toMatch(/5 Ziffern/i);
  });
});

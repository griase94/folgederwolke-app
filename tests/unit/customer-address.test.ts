/**
 * Customer structured-address validation (Andy-Feedback 2026-07). The Zod
 * schema makes Straße/PLZ/Ort MANDATORY and enforces the German 5-digit PLZ
 * rule for country=DE only (AT/CH keep 4-digit PLZ).
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
  country: "DE",
};

describe("validateAddCustomer — structured address", () => {
  it("accepts a complete German address", () => {
    const r = validateAddCustomer({ ...OK });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.strasse).toBe("Maximilianstraße 12");
      expect(r.data.plz).toBe("80539");
      expect(r.data.ort).toBe("München");
    }
  });

  it("rejects a missing Straße / PLZ / Ort with German errors", () => {
    const r = validateAddCustomer({ name: "X", country: "DE" });
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
      country: "AT",
      plz: "1010",
      ort: "Wien",
    });
    expect(r.success).toBe(true);
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

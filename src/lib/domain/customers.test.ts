import { describe, expect, it } from "vitest";
import {
  buildCustomerBriefblock,
  hasCompleteAddress,
  countryLabel,
} from "./customers.js";

describe("buildCustomerBriefblock", () => {
  it("assembles Straße + PLZ Ort as two lines (no name — the PDF adds it)", () => {
    expect(
      buildCustomerBriefblock({
        strasse: "Maximilianstraße 12",
        plz: "80539",
        ort: "München",
      }),
    ).toBe("Maximilianstraße 12\n80539 München");
  });

  it("trims parts and drops empty lines", () => {
    expect(
      buildCustomerBriefblock({
        strasse: "  Florastraße 84 ",
        plz: " 13187 ",
        ort: " Berlin ",
      }),
    ).toBe("Florastraße 84\n13187 Berlin");
  });

  it("omits the PLZ-Ort line when both are missing", () => {
    expect(
      buildCustomerBriefblock({ strasse: "Nurstraße 1", plz: null, ort: null }),
    ).toBe("Nurstraße 1");
  });

  it("returns '' when nothing is present", () => {
    expect(
      buildCustomerBriefblock({ strasse: null, plz: null, ort: null }),
    ).toBe("");
  });
});

describe("hasCompleteAddress", () => {
  it("is true only when all three parts are non-empty", () => {
    expect(
      hasCompleteAddress({ strasse: "A 1", plz: "80331", ort: "München" }),
    ).toBe(true);
    expect(
      hasCompleteAddress({ strasse: "A 1", plz: "", ort: "München" }),
    ).toBe(false);
    expect(hasCompleteAddress({ strasse: null, plz: null, ort: null })).toBe(
      false,
    );
    expect(
      hasCompleteAddress({ strasse: "  ", plz: "80331", ort: "München" }),
    ).toBe(false);
  });
});

describe("countryLabel", () => {
  it("maps known codes and passes through unknown", () => {
    expect(countryLabel("DE")).toBe("Deutschland");
    expect(countryLabel("AT")).toBe("Österreich");
    expect(countryLabel("XX")).toBe("XX");
  });
});

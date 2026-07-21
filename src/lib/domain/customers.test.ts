import { describe, expect, it } from "vitest";
import {
  buildCustomerBriefblock,
  hasCompleteAddress,
  isInland,
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

  it("puts the Adresszusatz on its own line ABOVE the Straße (DIN 5008)", () => {
    expect(
      buildCustomerBriefblock({
        adresszusatz: "z. Hd. Frau Müller",
        strasse: "Florastraße 84",
        plz: "13187",
        ort: "Berlin",
      }),
    ).toBe("z. Hd. Frau Müller\nFlorastraße 84\n13187 Berlin");
  });

  it("renders the Land line only when it is NOT Deutschland", () => {
    // Deutschland (any case) → no country line.
    expect(
      buildCustomerBriefblock({
        strasse: "A 1",
        plz: "80331",
        ort: "München",
        land: "Deutschland",
      }),
    ).toBe("A 1\n80331 München");
    // A foreign land → appended as the last line.
    expect(
      buildCustomerBriefblock({
        strasse: "Kärntner Ring 1",
        plz: "1010",
        ort: "Wien",
        land: "Österreich",
      }),
    ).toBe("Kärntner Ring 1\n1010 Wien\nÖsterreich");
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

describe("isInland", () => {
  it("recognizes Deutschland case/whitespace-insensitively", () => {
    expect(isInland("Deutschland")).toBe(true);
    expect(isInland("  deutschland ")).toBe(true);
    expect(isInland("Österreich")).toBe(false);
    expect(isInland(null)).toBe(false);
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

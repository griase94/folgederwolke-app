import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for the c/o-address change.
 *
 * The invoice footer used to render a hardcoded care-of glyph "℅ {kontaktPerson}"
 * plus a separate contact-phone line. Both were removed: a care-of is now just a
 * normal "c/o …" line of the multi-line VEREIN_ADRESSE (rendered with the rest of
 * the address), and no personal phone number appears on invoices.
 *
 * This guards the template source so neither can creep back. The retired
 * kontaktPerson/contactPhone fields are also gone from the type, so a reference
 * would not even compile — this is the belt to that suspenders.
 */
const TEMPLATE_SRC = readFileSync(
  resolve(
    __dirname,
    "..",
    "..",
    "src/lib/server/pdf/templates/rechnung-v2/template.ts",
  ),
  "utf8",
);

describe("invoice template — care-of lives in the address, not a ℅ glyph", () => {
  it("does not render the ℅ care-of glyph", () => {
    expect(TEMPLATE_SRC).not.toContain("℅");
  });

  it("does not reference the retired kontaktPerson / contactPhone fields", () => {
    expect(TEMPLATE_SRC).not.toMatch(/kontaktPerson|contactPhone/);
  });
});

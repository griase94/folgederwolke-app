import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for the c/o-address change.
 *
 * The invoice footer used to render a hardcoded care-of glyph "℅ {kontaktPerson}".
 * That was retired: a care-of is now just a normal "c/o …" line of the multi-line
 * VEREIN_ADRESSE (rendered with the rest of the address). The `kontaktPerson` field
 * is gone from the type, so a reference wouldn't even compile — this guards the
 * template source so the glyph + field can't creep back.
 *
 * (The contact PHONE is unrelated and legitimate again — a configurable
 * `contactPhone` in the footer contact column — so it is NOT forbidden here.)
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

  it("does not reference the retired kontaktPerson (℅ care-of person) field", () => {
    // contactPhone is a legitimate, configurable contact field again; only the
    // hardcoded "℅ kontaktPerson" care-of person was retired (the c/o now lives
    // in the address).
    expect(TEMPLATE_SRC).not.toMatch(/kontaktPerson/);
  });
});

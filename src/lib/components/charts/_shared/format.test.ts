import { describe, it, expect } from "vitest";
import {
  eurWhole,
  eurCents,
  eurWholeSigned,
  eurCentsSigned,
  pctWhole,
  pctOne,
  pctOneSigned,
  heroParts,
  realMinus,
  intWhole,
  MONTHS,
  MONTHS_FULL,
} from "./format.js";

// de-DE currency inserts a non-breaking space (U+00A0) before €; normalise it
// to a plain space so the expectations stay readable.
const nb = (s: string | null) =>
  (s ?? "").split(String.fromCharCode(160)).join(" ");

describe("dataviz format (de-DE, cents-in)", () => {
  it("whole + two-decimal euro from integer cents", () => {
    expect(nb(eurWhole(1482045))).toBe("14.820 €");
    expect(nb(eurCents(1482045))).toBe("14.820,45 €");
    expect(nb(eurCents(0))).toBe("0,00 €");
  });

  it("uses the real minus sign U+2212, never ASCII hyphen", () => {
    expect(nb(eurCents(-352000))).toBe("−3.520,00 €");
    expect(realMinus("-5")).toBe("−5");
    expect(eurCents(-352000)).not.toContain("-");
  });

  it("signed money always shows a leading + or −", () => {
    expect(nb(eurWholeSigned(562045))).toBe("+5.620 €");
    expect(nb(eurWholeSigned(-180000))).toBe("−1.800 €");
    expect(nb(eurCentsSigned(230000))).toBe("+2.300,00 €");
  });

  it("percent forms", () => {
    expect(pctWhole(85)).toBe("85 %");
    expect(pctOne(31.5)).toBe("31,5 %");
    expect(pctOneSigned(20.6)).toBe("+20,6 %");
    expect(pctOneSigned(-103.5)).toBe("−103,5 %");
  });

  it("heroParts splits euros from the demoted cent tail", () => {
    const g = heroParts(1482045);
    expect(g.main).toBe("14.820");
    expect(nb(g.rest)).toBe(",45 €");
    const neg = heroParts(-18000);
    expect(neg.main).toBe("−180");
    expect(nb(neg.rest)).toBe(",00 €");
  });

  it("survives extreme magnitudes without breaking", () => {
    expect(eurWhole(9_000_000_000_00)).toContain("€");
    expect(intWhole(1000)).toBe("1.000");
  });

  it("month vocabularies are 12 long", () => {
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS_FULL).toHaveLength(12);
    expect(MONTHS[2]).toBe("Mär");
    expect(MONTHS_FULL[11]).toBe("Dezember");
  });
});

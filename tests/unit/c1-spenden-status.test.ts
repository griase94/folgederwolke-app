/**
 * @phase-2
 *
 * C1 cycle 5 — Bescheinigungs-Status mapper for the Spenden tab.
 */

import { describe, it, expect } from "vitest";
import {
  bescheinigungStatusFor,
  type SpendeStatusRow,
} from "$lib/domain/bescheinigungs-status.js";

function makeRow(over: Partial<SpendeStatusRow> = {}): SpendeStatusRow {
  return {
    id: "d1",
    bescheinigungNr: null,
    bescheinigungAusgestelltAm: null,
    betragCents: 50000,
    memberId: "m1",
    spenderName: null,
    spendeKind: "geldspende",
    ...over,
  };
}

describe("bescheinigungStatusFor", () => {
  it("returns 'issued' when bescheinigungNr + ausgestelltAm both set", () => {
    expect(
      bescheinigungStatusFor(
        makeRow({
          bescheinigungNr: "B-2025-001",
          bescheinigungAusgestelltAm: "2025-01-15",
        }),
      ),
    ).toBe("issued");
  });

  it("returns 'pending' when no Nr yet but spender identifiable (member)", () => {
    expect(bescheinigungStatusFor(makeRow({ bescheinigungNr: null }))).toBe(
      "pending",
    );
  });

  it("returns 'na' when no member AND small donation (< 300 € per §50 Abs. 4 EStDV) AND no spenderName", () => {
    expect(
      bescheinigungStatusFor(
        makeRow({
          memberId: null,
          spenderName: null,
          betragCents: 15000, // 150€ — well below 300 €
        }),
      ),
    ).toBe("na");
  });

  it("returns 'na' just below the 300 € Kleinbetrag threshold", () => {
    expect(
      bescheinigungStatusFor(
        makeRow({
          memberId: null,
          spenderName: null,
          betragCents: 29999, // 299,99 €
        }),
      ),
    ).toBe("na");
  });

  it("returns 'pending' at and above the 300 € threshold (anonymous donor)", () => {
    expect(
      bescheinigungStatusFor(
        makeRow({
          memberId: null,
          spenderName: null,
          betragCents: 30000, // exactly 300 €
        }),
      ),
    ).toBe("pending");
    expect(
      bescheinigungStatusFor(
        makeRow({
          memberId: null,
          spenderName: null,
          betragCents: 30001,
        }),
      ),
    ).toBe("pending");
  });

  it("returns 'pending' when no member but spenderName present", () => {
    expect(
      bescheinigungStatusFor(
        makeRow({
          memberId: null,
          spenderName: "Max Mustermann",
          betragCents: 15000,
        }),
      ),
    ).toBe("pending");
  });

  it("handles bigint betragCents", () => {
    expect(
      bescheinigungStatusFor(
        makeRow({
          memberId: null,
          spenderName: null,
          betragCents: 15000n as unknown as number,
        }),
      ),
    ).toBe("na");
  });

  it("issued takes precedence even if other fields look odd", () => {
    expect(
      bescheinigungStatusFor(
        makeRow({
          bescheinigungNr: "B-2025-002",
          bescheinigungAusgestelltAm: "2025-03-01",
          memberId: null,
          spenderName: null,
        }),
      ),
    ).toBe("issued");
  });
});

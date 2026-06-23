/**
 * F27 (review F3) — donation betrag_eur fallback call-site wiring.
 *
 * validateSpendeInput coerces a friendlier `betrag_eur` string to betragCents
 * when no integer betragCents is posted. This test pins that the coercion routes
 * through the canonical parseEuroToCents — German thousands "1.234,56" → 123456,
 * NOT the 123 cents the old parseFloat(replace(",",".")) produced.
 *
 * @vitest-environment node
 * @phase-7
 */

import { describe, it, expect } from "vitest";
import { validateSpendeInput } from "$lib/server/domain/spenden.js";

function betragOf(raw: Record<string, unknown>): number | undefined {
  const r = validateSpendeInput(raw);
  if (!r.success) return undefined;
  return r.data.betragCents;
}

const base = {
  spender_name: "Erika Spenderin",
  spender_adresse: "Spendergasse 1, 80331 München",
  zugewendet_am: "2026-06-01",
  spende_kind: "geldspende",
};

describe("@phase-7 validateSpendeInput — betrag_eur→betragCents wiring (F27)", () => {
  it("German thousands '1.234,56' → 123456 cents (was 123)", () => {
    expect(betragOf({ ...base, betrag_eur: "1.234,56" })).toBe(123456);
  });

  it("comma-decimal '12,50' → 1250 cents", () => {
    expect(betragOf({ ...base, betrag_eur: "12,50" })).toBe(1250);
  });

  it("dot-decimal '12.34' → 1234 cents (NOT 123400)", () => {
    expect(betragOf({ ...base, betrag_eur: "12.34" })).toBe(1234);
  });

  it("dot-only thousands '1.000' → 100000 cents", () => {
    expect(betragOf({ ...base, betrag_eur: "1.000" })).toBe(100000);
  });

  it("an explicit integer betragCents still wins over betrag_eur", () => {
    expect(
      betragOf({ ...base, betragCents: "5000", betrag_eur: "1.234,56" }),
    ).toBe(5000);
  });
});

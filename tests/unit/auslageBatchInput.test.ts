/**
 * validateAuslageBatchInput — the public batch schema + error mapping
 * (Aurora A-flow S1). Covers the board mandates F1 (betrag>0), F2 (≤ cap),
 * F3 (IBAN mod-97) at the schema boundary, plus the extern-only rule and the
 * client_key error mapping the form relies on.
 */
import { describe, it, expect } from "vitest";
import { validateAuslageBatchInput } from "../../src/lib/server/domain/auslagen.js";
import { MAX_BATCH_ITEMS } from "../../src/lib/server/domain/auslage-submit.js";
import { DATENSCHUTZ_VERSION } from "../../src/lib/server/domain/datenschutz.js";

function item(over: Record<string, unknown> = {}) {
  return {
    client_key: "a1",
    bezeichnung: "Bahnticket München → Berlin",
    betrag_cents: 1250,
    rechnungsdatum: "2026-03-01",
    ...over,
  };
}
function batch(over: Record<string, unknown> = {}) {
  return {
    identity: {
      name: "Jane Doe",
      iban: "DE89370400440532013000",
      email: "jane@example.org",
    },
    consent_text_version: DATENSCHUTZ_VERSION,
    auslagen: [item()],
    ...over,
  };
}

describe("validateAuslageBatchInput", () => {
  it("accepts a valid extern batch and normalises the IBAN", () => {
    const res = validateAuslageBatchInput(
      batch({
        identity: {
          name: "Jane Doe",
          iban: "de89 3704 0044 0532 0130 00",
          email: "jane@example.org",
        },
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.identity.iban).toBe("DE89370400440532013000");
  });

  it("F1: a zero/negative betrag maps to the item's client_key", () => {
    const res = validateAuslageBatchInput(
      batch({ auslagen: [item({ betrag_cents: 0 })] }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.itemErrors["a1"]?.["betrag_cents"]?.length).toBeGreaterThan(0);
  });

  it("F2: more than MAX_BATCH_ITEMS is rejected", () => {
    const many = Array.from({ length: MAX_BATCH_ITEMS + 1 }, (_, i) =>
      item({ client_key: `a${i}` }),
    );
    const res = validateAuslageBatchInput(batch({ auslagen: many }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.formErrors.length).toBeGreaterThan(0);
  });

  it("F3: an invalid IBAN (mod-97) maps to identity.iban", () => {
    const res = validateAuslageBatchInput(
      batch({
        identity: {
          name: "Jane",
          iban: "DE00000000000000000000",
          email: "j@e.org",
        },
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.identityErrors["iban"]?.length).toBeGreaterThan(0);
  });

  it("extern-only: a member/verein-shaped payload is rejected (no payer arm)", () => {
    // `identity` is the extern-only shape; a `bezahlt_von` discriminated union
    // is not accepted here (AC #1).
    const res = validateAuslageBatchInput({
      bezahlt_von: { kind: "member", member_id: crypto.randomUUID() },
      consent_text_version: DATENSCHUTZ_VERSION,
      auslagen: [item()],
    });
    expect(res.ok).toBe(false);
  });

  it("maps a short bezeichnung to the right block by client_key", () => {
    const res = validateAuslageBatchInput(
      batch({
        auslagen: [item({ client_key: "x9", bezeichnung: "Bo" })],
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.itemErrors["x9"]?.["bezeichnung"]?.length).toBeGreaterThan(0);
  });

  it("rejects an impossible calendar date (30.02) cleanly", () => {
    const res = validateAuslageBatchInput(
      batch({ auslagen: [item({ rechnungsdatum: "2026-02-30" })] }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok)
      expect(res.itemErrors["a1"]?.["rechnungsdatum"]?.length).toBeGreaterThan(
        0,
      );
  });
});

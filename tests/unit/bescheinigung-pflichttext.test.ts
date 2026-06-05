/**
 * White-label Phase 1 — Task 1.6: the BMF Pflichttext renders the Finanzamt
 * line from `p.vereinFinanzamt` (full name, e.g. "Finanzamt München"), NOT
 * from a city extracted off the address. The surrounding boilerplate must NOT
 * read "Finanzamt Finanzamt …" — `vereinFinanzamt` already carries the word.
 */
import { describe, it, expect } from "vitest";
import { bescheidPflichttext } from "$lib/server/pdf/templates/bescheinigung-template.js";
import type { BmfPflichtfelder } from "$lib/server/domain/spenden.js";

const BASE: BmfPflichtfelder = {
  vereinName: "Verein X e.V.",
  vereinSteuernummer: "99/999/99999",
  vereinVr: "VR 777777",
  vereinAdresse: "Musterweg 1\n12345 Musterstadt",
  vereinFinanzamt: "Finanzamt Musterstadt",
  bescheidTyp: "freistellungsbescheid",
  bescheidDatum: "2024-03-15",
  satzungsFassung: null,
  freistellungsbescheidVz: "2024",
  steuerbegueZwecke: "der Foerderung des Sports",
  spenderName: "Max Mustermann",
  spenderAdresse: "Hauptstr. 1, 80331 Muenchen",
  spendeDatum: "2026-04-15",
  betragCents: 30000n,
  betragInWorten: "Dreihundert Euro",
  spendeKind: "geldspende",
  sacheBeschreibung: null,
  zweckbindungKind: "zweckfrei",
  zweckbindungText: null,
  bescheinigungNr: "B-2026-001",
  ausgestelltAm: "2026-05-01",
};

describe("Task 1.6 — bescheidPflichttext Finanzamt + Zwecke", () => {
  it("freistellungsbescheid: renders the full Finanzamt name, no double 'Finanzamt'", () => {
    const lines = bescheidPflichttext(BASE).join("\n");
    expect(lines).toContain("Finanzamt Musterstadt");
    // The var already contains "Finanzamt" — the boilerplate must not prefix it.
    expect(lines).not.toContain("Finanzamts Finanzamt");
    expect(lines).not.toContain("Finanzamt Finanzamt");
    expect(lines).toContain("der Foerderung des Sports");
  });

  it("feststellung_60a: renders the full Finanzamt name, no double 'Finanzamt'", () => {
    const lines = bescheidPflichttext({
      ...BASE,
      bescheidTyp: "feststellung_60a",
      satzungsFassung: "2022-06-01",
      freistellungsbescheidVz: null,
    }).join("\n");
    expect(lines).toContain("Finanzamt Musterstadt");
    expect(lines).not.toContain("Finanzamt Finanzamt");
    expect(lines).toContain("der Foerderung des Sports");
  });
});

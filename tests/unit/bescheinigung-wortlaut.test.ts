/**
 * B-PR4 S1 — the shared BMF-Wortlaut module is the single source for the
 * Zuwendungsbestätigung wording used by BOTH the on-screen `.doc-sheet`
 * preview (proper German) and the PDF template (ASCII, Helvetica core font).
 *
 * These tests are the "PDF-Text-Gleichheitsbeweis" (Q-ruling): they lock the
 * transliteration and prove the module's proper-German wording maps EXACTLY
 * to the ASCII the PDF draws — so the preview can never silently drift from
 * the issued certificate.
 */
import { describe, it, expect } from "vitest";
import {
  toPdfAscii,
  bmfTitel,
  bmfSubtitle,
  bmfVerzichtSatz,
  bmf50Hinweis,
  bmfHaftungHinweis,
  bmfBescheidText,
  type BescheidTextInput,
} from "$lib/domain/bescheinigung-wortlaut.js";
import { bescheidPflichttext } from "$lib/server/pdf/templates/bescheinigung-template.js";
import type { BmfPflichtfelder } from "$lib/server/domain/spenden.js";

describe("toPdfAscii", () => {
  it("maps §§ to Paragraphen BEFORE § to Paragraph (plural is a word)", () => {
    expect(toPdfAscii("§§ 51, 59, 60 und 61 AO")).toBe(
      "Paragraphen 51, 59, 60 und 61 AO",
    );
    expect(toPdfAscii("§ 10b EStG")).toBe("Paragraph 10b EStG");
    expect(toPdfAscii("§ 60a AO")).toBe("Paragraph 60a AO");
  });

  it("transliterates umlauts and ß to the Helvetica-safe digraphs", () => {
    expect(toPdfAscii("Förderung über Körperschaft, satzungsmäßig")).toBe(
      "Foerderung ueber Koerperschaft, satzungsmaessig",
    );
    expect(toPdfAscii("Ähnlich Öffnung Übung")).toBe(
      "Aehnlich Oeffnung Uebung",
    );
  });
});

describe("static BMF wording ↔ PDF ASCII (locked bytes)", () => {
  it("titles per Zuwendungsart match the exact strings the PDF draws", () => {
    expect(toPdfAscii(bmfTitel("geldspende"))).toBe(
      "Bestaetigung ueber Geldzuwendungen / Mitgliedsbeitraege",
    );
    expect(toPdfAscii(bmfTitel("sachspende"))).toBe(
      "Bestaetigung ueber Sachzuwendungen",
    );
  });

  it("subtitle, Verzicht line, §50 hint and Haftungs-Hinweis match the PDF ASCII", () => {
    expect(toPdfAscii(bmfSubtitle())).toBe(
      "im Sinne des Paragraph 10b des Einkommensteuergesetzes (EStG)",
    );
    expect(toPdfAscii(bmfVerzichtSatz())).toBe(
      "Es handelt sich nicht um den Verzicht auf Erstattung von Aufwendungen: ja.",
    );
    expect(toPdfAscii(bmf50Hinweis())).toBe(
      "Diese Zuwendungsbestaetigung ist maschinell erstellt und ohne Unterschrift gueltig (Paragraph 50 Absatz 1 EStDV).",
    );
    expect(toPdfAscii(bmfHaftungHinweis())).toBe(
      "Hinweis: Wer vorsaetzlich oder grob fahrlaessig eine unrichtige Zuwendungsbestaetigung " +
        "ausstellt oder veranlasst, dass Zuwendungen nicht zu den in der Zuwendungsbestaetigung " +
        "angegebenen steuerbeguenstigten Zwecken verwendet werden, haftet fuer die entgangene " +
        "Steuer (Paragraph 10b Abs. 4 EStG, Paragraph 9 Abs. 3 KStG, Paragraph 9 Nr. 5 GewStG).",
    );
  });
});

// An ASCII-only fixture: env values carry no umlauts, so transliterating the
// whole preview string is a no-op on the interpolated parts and thus a clean
// equivalence to the PDF's ASCII builder.
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

function toInput(p: BmfPflichtfelder): BescheidTextInput {
  return {
    bescheidTyp: p.bescheidTyp,
    steuerbegueZwecke: p.steuerbegueZwecke,
    vereinFinanzamt: p.vereinFinanzamt,
    vereinSteuernummer: p.vereinSteuernummer,
    bescheidDatum: p.bescheidDatum,
    freistellungsbescheidVz: p.freistellungsbescheidVz,
    satzungsFassung: p.satzungsFassung,
  };
}

describe("interpolated Bescheid-Pflichttext ↔ PDF (proof of equivalence)", () => {
  it("freistellungsbescheid: toPdfAscii(preview) === PDF ASCII builder", () => {
    expect(bmfBescheidText(toInput(BASE)).map(toPdfAscii)).toEqual(
      bescheidPflichttext(BASE),
    );
  });

  it("feststellung_60a: toPdfAscii(preview) === PDF ASCII builder", () => {
    const p60a: BmfPflichtfelder = {
      ...BASE,
      bescheidTyp: "feststellung_60a",
      satzungsFassung: "2022-06-01",
      freistellungsbescheidVz: null,
    };
    expect(bmfBescheidText(toInput(p60a)).map(toPdfAscii)).toEqual(
      bescheidPflichttext(p60a),
    );
  });

  it("mirrors the PDF's throw-guards (missing Finanzamt / VZ / Satzung)", () => {
    expect(() =>
      bmfBescheidText({ ...toInput(BASE), vereinFinanzamt: "  " }),
    ).toThrow(/vereinFinanzamt missing/);
    expect(() =>
      bmfBescheidText({ ...toInput(BASE), freistellungsbescheidVz: null }),
    ).toThrow(/freistellungsbescheidVz missing/);
    expect(() =>
      bmfBescheidText({
        ...toInput(BASE),
        bescheidTyp: "feststellung_60a",
        freistellungsbescheidVz: null,
        satzungsFassung: null,
      }),
    ).toThrow(/satzungsFassung missing/);
  });
});

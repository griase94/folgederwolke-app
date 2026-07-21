import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/svelte";
import BescheinigungDocument from "./BescheinigungDocument.svelte";
import type { BescheinigungPreview } from "./BescheinigungDocument.svelte";

afterEach(() => cleanup());

const GELD: BescheinigungPreview = {
  vereinName: "Folge der Wolke e.V.",
  vereinSteuernummer: "143/210/50123",
  vereinVr: "VR 20114",
  vereinAdresse: "Wolkenweg 7\n80333 München",
  vereinFinanzamt: "Finanzamt München",
  bescheidTyp: "freistellungsbescheid",
  bescheidDatum: "2025-02-04",
  satzungsFassung: null,
  freistellungsbescheidVz: "2024",
  steuerbegueZwecke: "der Jugendhilfe",
  spenderName: "Ines Achleitner",
  spenderAdresse: "Sonnenstraße 14, 80333 München",
  spendeDatum: "2026-03-12",
  betragCents: 15000,
  betragInWorten: "einhundertfünfzig Euro",
  spendeKind: "geldspende",
  sacheBeschreibung: null,
  zweckbindungKind: "zweckfrei",
  zweckbindungText: null,
  bescheinigungNr: "(noch nicht vergeben)",
  ausgestelltAm: "2026-03-12",
};

describe("BescheinigungDocument", () => {
  it("renders the Geldzuwendungs-Titel, Betrag, in-Worten and §50 note", () => {
    render(BescheinigungDocument, { props: { preview: GELD } });
    expect(
      screen.getByText("Bestätigung über Geldzuwendungen / Mitgliedsbeiträge"),
    ).toBeTruthy();
    expect(screen.getByText("150,00 €")).toBeTruthy();
    expect(screen.getByText("einhundertfünfzig Euro")).toBeTruthy();
    // the §50 machine-signature note (proper German, § not "Paragraph")
    expect(
      screen.getByText(/ohne Unterschrift gültig \(§ 50 Absatz 1 EStDV\)/),
    ).toBeTruthy();
    // the Bescheid-Pflichttext boilerplate (freistellungsbescheid branch)
    expect(screen.getByText(/Freistellungsbescheid/)).toBeTruthy();
  });

  it("renders the distinct Sachzuwendungs-Titel + Bezeichnung for a Sachspende", () => {
    render(BescheinigungDocument, {
      props: {
        preview: {
          ...GELD,
          spendeKind: "sachspende",
          sacheBeschreibung: "Gebrauchtes Kletterseil, 60 m, guter Zustand",
        },
      },
    });
    expect(screen.getByText("Bestätigung über Sachzuwendungen")).toBeTruthy();
    expect(
      screen.getByText("Genaue Bezeichnung der Sachzuwendung"),
    ).toBeTruthy();
    expect(
      screen.getByText("Gebrauchtes Kletterseil, 60 m, guter Zustand"),
    ).toBeTruthy();
    expect(screen.getByText("Wert der Zuwendung")).toBeTruthy();
  });
});

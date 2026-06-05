/**
 * Fix 1 — SpendeDetailFields renders Spendenart as a READ-ONLY chip.
 *
 * Regression guard for the save dead-end: a live Geldspende→Sachspende toggle
 * revealed only the READ-ONLY Wertermittlung block with EMPTY hidden
 * carry-forwards, which editSpende's superRefine rejects (422) with no editable
 * inputs to fix it. The detail page must therefore NOT offer a Spendenart switch
 * — it shows a fixed chip + a hidden spende_kind input pinned to the row's kind.
 */

import { render, screen } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import SpendeDetailFields from "./SpendeDetailFields.svelte";

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "d-1",
    kind: "donation",
    businessId: "S-2026-001",
    bezeichnung: "Spende von Erika",
    betragCents: 5000,
    currency: "EUR",
    gebuchtAm: "2026-03-01T00:00:00.000Z",
    sphereSnapshot: "ideeller",
    kategorieNameSnapshot: "Geldspende zweckfrei",
    festgeschriebenAt: null,
    yearOfBuchung: 2026,
    spenderName: "Erika Externe",
    spenderAdresse: "Hauptstr. 1, 10115 Berlin",
    spenderEmail: null,
    bescheinigungNr: null,
    spendeKind: "geldspende",
    zweckbindungKind: "zweckfrei",
    zweckbindungText: null,
    wertermittlungMethode: null,
    zustandBeschreibung: null,
    herkunftsbelegFileId: null,
    betriebsvermoegen: false,
    belegFileId: null,
    bezahltVonMemberId: null,
    timeline: [],
    ...overrides,
  } as unknown as Parameters<typeof SpendeDetailFields>[1]["detail"];
}

describe("SpendeDetailFields — Spendenart is read-only (no 422 dead end)", () => {
  it("renders a fixed Spendenart chip, NOT a Geld/Sach toggle, for a Geldspende", () => {
    const { container } = render(SpendeDetailFields, {
      props: { detail: detail() },
    });
    // The read-only chip shows the row's kind…
    expect(screen.getByTestId("detail-spendeart-chip").textContent).toContain(
      "Geldspende",
    );
    // …and there is NO clickable Sachspende toggle to reach the empty-carry 422.
    expect(
      container.querySelector('[data-testid="detail-spendeart-sachspende"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="detail-spendeart-geldspende"]'),
    ).toBeNull();
    // The hidden spende_kind input is pinned to the actual kind.
    const hidden = container.querySelector<HTMLInputElement>(
      'input[name="spende_kind"]',
    );
    expect(hidden?.value).toBe("geldspende");
    // A Geldspende exposes no Sachspende Wertermittlung block at all.
    expect(
      container.querySelector(
        '[data-testid="detail-sachspende-wertermittlung"]',
      ),
    ).toBeNull();
  });

  it("for a Sachspende the chip + hidden input + non-empty carry-forwards are aligned", () => {
    const { container } = render(SpendeDetailFields, {
      props: {
        detail: detail({
          spendeKind: "sachspende",
          wertermittlungMethode: "marktpreis",
          zustandBeschreibung: "Gebraucht, gut erhalten",
        }),
      },
    });
    expect(screen.getByTestId("detail-spendeart-chip").textContent).toContain(
      "Sachspende",
    );
    expect(
      container.querySelector<HTMLInputElement>('input[name="spende_kind"]')
        ?.value,
    ).toBe("sachspende");
    // The carry-forward hidden inputs mirror the persisted (non-empty) values,
    // so editSpende's superRefine is satisfied on save.
    expect(
      container.querySelector<HTMLInputElement>(
        'input[name="wertermittlung_methode"]',
      )?.value,
    ).toBe("marktpreis");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[name="zustand_beschreibung"]',
      )?.value,
    ).toBe("Gebraucht, gut erhalten");
  });
});

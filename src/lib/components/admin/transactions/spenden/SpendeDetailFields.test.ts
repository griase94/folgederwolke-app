/**
 * Fix 1 — SpendeDetailFields renders Spendenart as a READ-ONLY chip.
 *
 * Regression guard for the save dead-end: a live Geldspende→Sachspende toggle
 * revealed only the READ-ONLY Wertermittlung block with EMPTY hidden
 * carry-forwards, which editSpende's superRefine rejects (422) with no editable
 * inputs to fix it. The detail page must therefore NOT offer a Spendenart switch
 * — it shows a fixed chip + a hidden spende_kind input pinned to the row's kind.
 */

import { render, screen, cleanup, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, afterEach } from "vitest";
import SpendeDetailFields from "./SpendeDetailFields.svelte";

// The form uses `use:enhance`. We capture the enhance callback so FIX B tests
// can drive the success/failure paths. Static-markup tests (below) don't need
// to invoke it — they just need the mock present so the form renders.
const { toastMock, getCapturedEnhance, setCapturedEnhance } = vi.hoisted(() => {
  const toastMock = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  };
  let capturedEnhance: ((opts: { result: unknown }) => Promise<void>) | null =
    null;
  return {
    toastMock,
    getCapturedEnhance: () => capturedEnhance,
    setCapturedEnhance: (
      v: ((opts: { result: unknown }) => Promise<void>) | null,
    ) => {
      capturedEnhance = v;
    },
  };
});

vi.mock("$app/forms", () => ({
  enhance: (
    _form: HTMLFormElement,
    cb: () => (opts: { result: unknown }) => Promise<void>,
  ) => {
    setCapturedEnhance(cb());
    return { destroy() {} };
  },
  applyAction: vi.fn(),
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

afterEach(() => {
  cleanup();
  setCapturedEnhance(null);
  toastMock.success.mockClear();
  toastMock.error.mockClear();
});

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

// ── FIX B (review): success toast + onSaved callback ─────────────────────
describe("SpendeDetailFields — FIX B: success toast + onSaved callback", () => {
  it("calls toast.success and onSaved when result.type === 'success'", async () => {
    const onSaved = vi.fn();
    render(SpendeDetailFields, { props: { detail: detail(), onSaved } });
    const enhance = getCapturedEnhance();
    expect(enhance).not.toBeNull();
    await enhance!({ result: { type: "success", data: { ok: true } } });
    expect(toastMock.success).toHaveBeenCalledWith("Änderungen gespeichert");
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("calls toast.error and NOT onSaved when result.type === 'failure'", async () => {
    const onSaved = vi.fn();
    render(SpendeDetailFields, { props: { detail: detail(), onSaved } });
    const enhance = getCapturedEnhance();
    expect(enhance).not.toBeNull();
    await enhance!({
      result: {
        type: "failure",
        data: { error: "Bescheinigt — kein Editieren" },
      },
    });
    expect(toastMock.error).toHaveBeenCalledWith(
      "Bescheinigt — kein Editieren",
    );
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

// ── FIX D (review): betragCents hidden input derives reactively from betragEur
describe("SpendeDetailFields — FIX D: betragCents reactive derivation", () => {
  it("hidden betragCents reflects the initial detail value on render", () => {
    const { container } = render(SpendeDetailFields, {
      props: { detail: detail({ betragCents: 5000 }) },
    });
    const hidden = container.querySelector<HTMLInputElement>(
      'input[name="betragCents"]',
    );
    expect(hidden).not.toBeNull();
    // 5000 cents → rendered as 5000 (the derived value from 50 * 100)
    expect(Number(hidden?.value)).toBe(5000);
  });

  it("hidden betragCents updates when the visible number input changes", async () => {
    const { container } = render(SpendeDetailFields, {
      props: { detail: detail({ betragCents: 5000 }) },
    });
    const visibleInput =
      container.querySelector<HTMLInputElement>("#detail-betrag");
    expect(visibleInput).not.toBeNull();
    // Simulate the user typing 12.50 → betragCents must become 1250
    await fireEvent.input(visibleInput!, { target: { value: "12.50" } });
    const hidden = container.querySelector<HTMLInputElement>(
      'input[name="betragCents"]',
    );
    expect(Number(hidden?.value)).toBe(1250);
  });
});

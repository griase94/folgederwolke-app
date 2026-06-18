// SpendeFields.test.ts
//
// Wire-through coverage for the Anlage-Gem-Zeile (item 8): the form resolves the
// Zeile for the CURRENTLY-derived donation Kategorie from the `anlageGemZeilen`
// map (load-supplied) and passes it into the DerivedKategorieBadge, which shows
// it when known and degrades gracefully (omits it) when null.
//
// Package C3: Betrag type=text inputmode=decimal, BelegUpload optional for
// Geldspende beleg + Sachspende Herkunftsbeleg, zugewendetAm seeds today.
//
// Reset lane (renders a Svelte component) → `pnpm test --run <file>`.
import { render, screen, cleanup } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import SpendeFields from "./SpendeFields.svelte";

afterEach(() => cleanup());

const today = new Date().toISOString().slice(0, 10);

describe("SpendeFields — C3 redesign", () => {
  it("Betrag field is type=text with inputmode=decimal (not type=number)", () => {
    render(SpendeFields, { props: { members: [], projects: [] } });
    const displayInput = document.querySelector(
      'input[inputmode="decimal"]',
    ) as HTMLInputElement | null;
    expect(displayInput).not.toBeNull();
    expect(displayInput?.type).toBe("text");
  });

  it("Geldspende: BelegUpload optional rendered (no keinBeleg toggle)", () => {
    render(SpendeFields, { props: { members: [], projects: [] } });
    // optional=true suppresses keinBeleg
    const keinBelegCheckbox = document.querySelector('input[name="keinBeleg"]');
    expect(keinBelegCheckbox).toBeNull();
    // BelegUpload dropzone present
    const dropzone = document.querySelector('[data-slot="beleg-upload"]');
    expect(dropzone).not.toBeNull();
  });

  it("zugewendetAm hidden ISO field defaults to today on a fresh form", () => {
    render(SpendeFields, { props: { members: [], projects: [] } });
    const hiddenDate = document.querySelector(
      'input[name="zugewendet_am"]',
    ) as HTMLInputElement | null;
    expect(hiddenDate).not.toBeNull();
    expect(hiddenDate?.value).toBe(today);
  });
});

describe("SpendeFields — Anlage-Gem-Zeile wire-through", () => {
  it("surfaces the Anlage-Gem-Zeile for the default derived Kategorie (Geldspende zweckfrei)", () => {
    render(SpendeFields, {
      props: {
        members: [],
        projects: [],
        // The load supplies a name → Zeile map; default pickers derive
        // "Geldspende zweckfrei".
        anlageGemZeilen: { "Geldspende zweckfrei": 4 },
      },
    });
    expect(screen.getByText(/Anlage Gem Zeile 4/)).toBeTruthy();
  });

  it("omits the Zeile when the map has no entry for the derived Kategorie", () => {
    render(SpendeFields, {
      props: {
        members: [],
        projects: [],
        anlageGemZeilen: {},
      },
    });
    expect(screen.queryByText(/Anlage Gem Zeile/)).toBeNull();
    // The rest of the derived badge still renders.
    expect(screen.getByText(/Geldspende zweckfrei/)).toBeTruthy();
  });
});

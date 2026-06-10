// SpendeFields.test.ts
//
// Wire-through coverage for the Anlage-Gem-Zeile (item 8): the form resolves the
// Zeile for the CURRENTLY-derived donation Kategorie from the `anlageGemZeilen`
// map (load-supplied) and passes it into the DerivedKategorieBadge, which shows
// it when known and degrades gracefully (omits it) when null.
//
// Reset lane (renders a Svelte component) → `pnpm test --run <file>`.
import { render, screen, cleanup } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import SpendeFields from "./SpendeFields.svelte";

afterEach(() => cleanup());

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

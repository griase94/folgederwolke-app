/**
 * Responsive-visibility guard.
 *
 * Tailwind's `hidden` and `inline-flex` are BOTH display utilities of equal
 * specificity, so `class="inline-flex hidden md:inline-flex"` is decided by
 * stylesheet order, not by what the author meant — and `inline-flex` wins.
 * That bit twice in this PR: the CSV export and the "Neu erfassen" trigger both
 * stayed visible on a phone, where the spec puts them in the filter sheet and
 * on the ⊕ tab respectively.
 *
 * The rule: to hide something that a shared class already gives a display, use
 * the `max-md:` variant (variants sort after base utilities). This test reads
 * the sources so a future "hidden md:…" next to a TOOLBAR_* class fails here
 * rather than on someone's phone.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const srcDir = resolve(__dirname, "..", "..", "src");
const src = (rel: string) => readFileSync(resolve(srcDir, rel), "utf8");

describe("responsive visibility of toolbar affordances", () => {
  it("the CreateMenu trigger hides below md with a variant, not a bare `hidden`", () => {
    const s = src("lib/components/admin/CreateMenu.svelte");
    expect(s).toContain("max-md:hidden");
    expect(s).not.toMatch(/'hidden md:inline-flex'/);
    // It wears the Kit CTA geometry, not a rebuilt class chain (§2.1).
    expect(s).toContain("buttonVariants({ size: 'cta' })");
  });

  it("the CSV export hides below md with a variant, not a bare `hidden`", () => {
    const s = src("lib/components/admin/transactions/FilterBar.svelte");
    expect(s).toMatch(/csvLink\("max-md:hidden"/);
    expect(s).not.toMatch(/csvLink\("hidden md:/);
    // The sheet copy spells the action out; the toolbar keeps the short label.
    expect(s).toContain('"Gefilterte Liste als CSV"');
  });

  it("no toolbar geometry class carries a display utility that a `hidden` could fight", () => {
    const s = src("lib/components/ui/list-toolbar/ListToolbar.svelte");
    // TOOLBAR_CONTROL is for inputs (no display of its own); the two button
    // geometries do set one — which is exactly why callers must use max-md:.
    const control = s.match(/TOOLBAR_CONTROL =\s*'([^']+)'/)?.[1] ?? "";
    expect(control).not.toMatch(/\b(inline-)?flex\b/);
  });
});

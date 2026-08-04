/**
 * ListToolbar — the composed toolbar anatomy (Andys Regel 7, spec §3).
 *
 * The structural guarantee behind the "Δy of the actions = 0" acceptance
 * criterion: the actions live INSIDE row 1, and the chip row is row 1's
 * following sibling. As long as that holds, growing a chip row cannot move the
 * action group — the old layout put the filter bar and the actions side by side
 * in a vertically centred row, so a second chip line re-centred both.
 */
import { render, cleanup } from "@testing-library/svelte";
import { describe, it, expect, afterEach } from "vitest";
import Harness from "./ListToolbar.test.svelte";
import { TOOLBAR_CONTROL, TOOLBAR_BUTTON, TOOLBAR_PRIMARY } from "./index.js";

afterEach(() => cleanup());

describe("ListToolbar — anatomy", () => {
  it("keeps the actions inside row 1 and the chips in a following sibling row", () => {
    const { container } = render(Harness, { props: { hasChips: true } });
    const toolbar = container.querySelector<HTMLElement>(
      '[data-slot="list-toolbar"]',
    )!;
    const row = toolbar.querySelector<HTMLElement>(
      '[data-slot="toolbar-row"]',
    )!;
    const chipRow = toolbar.querySelector<HTMLElement>(
      '[data-slot="toolbar-chips"]',
    )!;

    // The primary CTA is a descendant of row 1 …
    const primary = container.querySelector('[data-slot="new-cta"]')!;
    expect(row.contains(primary)).toBe(true);
    // … and the chip row is a SIBLING that follows it, never a wrapper.
    expect(chipRow.previousElementSibling).toBe(row);
    expect(chipRow.contains(primary)).toBe(false);
  });

  it("does not spend a row on chips when there are none", () => {
    const { container } = render(Harness, { props: { hasChips: false } });
    expect(container.querySelector('[data-slot="toolbar-chips"]')).toBeNull();
    expect(container.querySelector('[data-slot="toolbar-row"]')).toBeTruthy();
  });

  it("is full-width so the right edge can align with the list card below", () => {
    const { container } = render(Harness, { props: {} });
    const toolbar = container.querySelector<HTMLElement>(
      '[data-slot="list-toolbar"]',
    )!;
    expect(toolbar.className).toContain("w-full");
    expect(
      toolbar.querySelector<HTMLElement>('[data-slot="toolbar-row"]')!
        .className,
    ).toContain("w-full");
  });

  it("pushes meta + actions to the right edge of the same row", () => {
    const { container } = render(Harness, { props: { withMeta: true } });
    const group = container.querySelector<HTMLElement>(
      '[data-slot="toolbar-row"] > div',
    )!;
    expect(group.className).toContain("ml-auto");
    expect(group.querySelector('[data-slot="new-cta"]')).toBeTruthy();
  });
});

describe("ListToolbar — one control scale (spec §3)", () => {
  it("every exported geometry is 44px on mobile and 40px from md", () => {
    for (const cls of [TOOLBAR_CONTROL, TOOLBAR_BUTTON, TOOLBAR_PRIMARY]) {
      expect(cls).toContain("h-11");
      expect(cls).toContain("md:h-10");
      expect(cls).toContain("rounded-[10px]");
    }
  });

  it("uses the md breakpoint, never lg (guidelines §1.5)", () => {
    for (const cls of [TOOLBAR_CONTROL, TOOLBAR_BUTTON, TOOLBAR_PRIMARY]) {
      expect(cls).not.toMatch(/\blg:h-/);
    }
  });
});

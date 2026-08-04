/**
 * The control-height canon (DESIGN-GUIDELINES §1.5, ratified 2026-08-04).
 *
 * Two families, one rule each:
 *
 *   FORM FIELDS   flat `h-11` — 44px on every viewport, no md step-down.
 *                 Eight to eleven stacked fields in a dialog gain nothing
 *                 visible from 40px, lose touch comfort, and reflow on resize.
 *
 *   ROW CONTROLS  `h-11 md:h-10` — a toolbar or bulk bar is a single dense line
 *                 beside a list, where the 4px matters.
 *
 * And the trap that made this a guard rather than a comment: a `min-h-11`
 * WITHOUT an `md:min-h-10` beside it silently outranks `md:h-10`, because
 * min-height beats height and the mobile min-height has no md counterpart. That
 * shipped in the Kit's `cta` button (#167) and rendered every CTA in the app
 * 44px at desktop, 4px taller than the controls beside it — invisible to tests
 * that only assert the height class. So this file asserts the EFFECTIVE height:
 * whatever raises a min-height at mobile size must release it at md.
 */
import { describe, it, expect } from "vitest";
import { FIELD_CLASS } from "$lib/components/ui/field-class/index.js";
import {
  TOOLBAR_CONTROL,
  TOOLBAR_BUTTON,
} from "$lib/components/ui/list-toolbar/index.js";
import { buttonVariants } from "$lib/components/ui/button/index.js";

/** Anything that sets a min-height at mobile size must release it at md. */
function assertMinHeightReleased(cls: string, name: string) {
  if (/\bmin-h-11\b/.test(cls) && /\bmd:h-10\b/.test(cls)) {
    expect(
      cls,
      `${name}: has md:h-10 but keeps min-h-11 at md — the min-height wins and it renders 44px`,
    ).toMatch(/\bmd:min-h-10\b/);
  }
}

describe("form fields — flat h-11 on every viewport", () => {
  const FIELDS: Array<[string, string]> = [["FIELD_CLASS", FIELD_CLASS]];

  it.each(FIELDS)("%s is 44px", (name, cls) => {
    expect(cls, name).toContain("h-11");
    expect(cls, name).toContain("min-h-11");
  });

  it.each(FIELDS)("%s does NOT step down at md", (name, cls) => {
    expect(
      cls,
      `${name}: fields stay 44px — md:h-10 belongs to row controls`,
    ).not.toMatch(/\bmd:h-10\b/);
  });

  it.each(FIELDS)("%s never uses the lg breakpoint", (name, cls) => {
    // sign-in shipped `h-11 lg:h-10`, a third breakpoint the canon does not have.
    expect(cls, `${name}: the breakpoint is always md`).not.toMatch(
      /\blg:h-\d/,
    );
  });
});

describe("row controls — h-11 md:h-10, with the min-height released", () => {
  const ROWS: Array<[string, string]> = [
    ["TOOLBAR_CONTROL", TOOLBAR_CONTROL],
    ["TOOLBAR_BUTTON", TOOLBAR_BUTTON],
    ["Button size=cta", buttonVariants({ size: "cta" })],
  ];

  it.each(ROWS)("%s steps 44 → 40 at md", (name, cls) => {
    expect(cls, name).toContain("h-11");
    expect(cls, name).toContain("md:h-10");
  });

  it.each(ROWS)(
    "%s releases its min-height at md (the #167 bug class)",
    (name, cls) => {
      assertMinHeightReleased(cls, name);
    },
  );

  it.each(ROWS)("%s never uses the lg breakpoint", (name, cls) => {
    expect(cls, `${name}: the breakpoint is always md`).not.toMatch(
      /\blg:h-\d/,
    );
  });
});

describe("the guard itself", () => {
  it("catches a min-h-11 that forgot its md release", () => {
    expect(() =>
      assertMinHeightReleased("h-11 min-h-11 md:h-10", "synthetic"),
    ).toThrow();
    expect(() =>
      assertMinHeightReleased("h-11 min-h-11 md:h-10 md:min-h-10", "synthetic"),
    ).not.toThrow();
  });
});

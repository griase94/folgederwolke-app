// field-class.test.ts
//
// Verifies the shared FIELD_CLASS + CHECKBOX_CLASS constants carry the exact
// Aurora tokens the field baseline promises (DESIGN-GUIDELINES §3).
// The height CANON itself (flat h-11 for fields vs h-11 md:h-10 for row
// controls) is pinned app-wide in tests/unit/control-height-canon.test.ts.
import { describe, it, expect } from "vitest";
import { FIELD_CLASS, CHECKBOX_CLASS } from "./index.js";

describe("FIELD_CLASS", () => {
  it("contains h-11 min-h-11 for the control height", () => {
    expect(FIELD_CLASS).toContain("h-11");
    expect(FIELD_CLASS).toContain("min-h-11");
  });

  it("contains w-full", () => {
    expect(FIELD_CLASS).toContain("w-full");
  });

  it("contains rounded-[10px] (Aurora control radius)", () => {
    expect(FIELD_CLASS).toContain("rounded-[10px]");
  });

  it("contains border border-hairline (Aurora hairline border)", () => {
    expect(FIELD_CLASS).toContain("border");
    expect(FIELD_CLASS).toContain("border-hairline");
  });

  it("contains bg-card (a theme surface that inverts in dark, not bg-white)", () => {
    expect(FIELD_CLASS).toContain("bg-card");
    expect(FIELD_CLASS).not.toContain("bg-white");
  });

  it("contains px-3 text-sm outline-none", () => {
    expect(FIELD_CLASS).toContain("px-3");
    expect(FIELD_CLASS).toContain("text-sm");
    expect(FIELD_CLASS).toContain("outline-none");
  });

  it("contains Aurora focus ring tokens", () => {
    expect(FIELD_CLASS).toContain("focus-visible:ring-2");
    expect(FIELD_CLASS).toContain("focus-visible:ring-ring");
    expect(FIELD_CLASS).toContain("focus-visible:ring-offset-1");
  });

  it("does NOT contain any hardcoded hex color", () => {
    expect(FIELD_CLASS).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});

describe("CHECKBOX_CLASS", () => {
  it("is the one checkbox anatomy: 16px box, hairline border, primary accent", () => {
    expect(CHECKBOX_CLASS).toContain("size-4");
    expect(CHECKBOX_CLASS).toContain("rounded");
    expect(CHECKBOX_CLASS).toContain("border-hairline");
    expect(CHECKBOX_CLASS).toContain("accent-primary");
  });

  it("never states a brand that is not ours", () => {
    // The app had accent-indigo-600 and accent-pink-600 in live checkboxes;
    // a raw palette accent ignores the theme and asserts a foreign brand.
    expect(CHECKBOX_CLASS).not.toMatch(
      /accent-(indigo|pink|blue|green|red|amber|violet|emerald|rose)-\d/,
    );
  });

  it("does not shrink in a flex row", () => {
    expect(CHECKBOX_CLASS).toContain("shrink-0");
  });
});

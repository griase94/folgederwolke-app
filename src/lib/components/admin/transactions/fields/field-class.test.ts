// field-class.test.ts
//
// Verifies the shared FIELD_CLASS constant exported from field-class.ts carries
// the exact Aurora tokens required by the Package B plan.
import { describe, it, expect } from "vitest";
import { FIELD_CLASS } from "./field-class.js";

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

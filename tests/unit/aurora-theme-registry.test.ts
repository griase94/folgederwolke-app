// @vitest-environment node
/**
 * Aurora slice 1 — theme registry contract (master plan §2.2, verbatim).
 * The registry is the single source of truth for valid theme ids; the
 * server hook and the setTheme action both validate against it, so a
 * hostile cookie value can never reach the rendered HTML.
 */
import { describe, expect, it } from "vitest";
import {
  themes,
  DEFAULT_THEME,
  THEME_COOKIE,
  resolveThemeId,
} from "../../src/lib/themes/index.js";

describe("theme registry (master §2.2)", () => {
  it("exports the frozen contract values", () => {
    expect(DEFAULT_THEME).toBe("aurora");
    expect(THEME_COOKIE).toBe("fdw_theme");
    expect(themes).toEqual([
      {
        id: "aurora",
        label: "Aurora",
        swatches: ["#ff1e8c", "#a855f7", "#3b82f6"],
        // F1 shipped the Nacht dark palette → the switcher offers Hell/Dunkel/System.
        hasDark: true,
      },
    ]);
  });

  it("the default theme is always registered", () => {
    expect(themes.some((t) => t.id === DEFAULT_THEME)).toBe(true);
  });

  it("resolveThemeId returns registered ids unchanged", () => {
    expect(resolveThemeId("aurora")).toBe("aurora");
  });

  it("resolveThemeId falls back to the default for unknown/missing/hostile values", () => {
    expect(resolveThemeId(undefined)).toBe("aurora");
    expect(resolveThemeId("")).toBe("aurora");
    expect(resolveThemeId("rose-noir")).toBe("aurora");
    expect(resolveThemeId('"><script>alert(1)</script>')).toBe("aurora");
  });
});

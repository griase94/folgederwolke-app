/**
 * @phase-7 C7 — Safe-area-inset utility audit
 *
 * Locks the presence of the .safe-* utilities in app.css. The MobileTabBar
 * + future fullscreen surfaces rely on these — accidental deletion would
 * silently break the home-indicator gutter on iPhone X+.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("app.css — safe-area utilities (PM-010)", () => {
  const css = readFileSync(resolve(__dirname, "./app.css"), "utf8");

  it("defines .safe-top utility", () => {
    expect(css).toMatch(/\.safe-top\s*\{[^}]*safe-area-inset-top/);
  });

  it("defines .safe-bottom utility", () => {
    expect(css).toMatch(/\.safe-bottom\s*\{[^}]*safe-area-inset-bottom/);
  });

  it("defines .safe-x utility for landscape gutters", () => {
    expect(css).toMatch(/\.safe-x\s*\{[^}]*safe-area-inset-left/);
    expect(css).toMatch(/\.safe-x\s*\{[^}]*safe-area-inset-right/);
  });

  it("defines .nav-safe-bottom for bottom tab bars", () => {
    expect(css).toMatch(/\.nav-safe-bottom\s*\{[^}]*safe-area-inset-bottom/);
  });

  it("viewport-fit=cover prerequisite is documented in the comment", () => {
    // Sanity: comment mentions viewport-fit=cover prerequisite.
    expect(css).toMatch(/viewport-fit=cover/);
  });
});

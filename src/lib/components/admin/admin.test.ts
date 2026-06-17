/**
 * nav-registry structural invariants (Aurora slice 2: registry is
 * desktop-only — the mobile bar is hardcoded in MobileTabBar.svelte).
 */
import { describe, expect, it } from "vitest";
import { navItems, mainNavItems, moreNavItems } from "./nav-registry.js";

describe("nav-registry", () => {
  it("exports a non-empty navItems array", () => {
    expect(navItems.length).toBeGreaterThan(0);
  });

  it("every item has label, href, icon, and group", () => {
    for (const item of navItems) {
      expect(item.label).toBeTruthy();
      expect(item.href).toMatch(/^\/app/);
      expect(item.icon).toBeTruthy();
      expect(["main", "more"]).toContain(item.group);
    }
  });

  it("mainNavItems and moreNavItems partition navItems completely", () => {
    expect(mainNavItems.length + moreNavItems.length).toBe(navItems.length);
  });

  it("no duplicate hrefs in navItems", () => {
    const hrefs = navItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

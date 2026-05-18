/**
 * @phase-3 admin nav-registry unit tests.
 */

import { describe, expect, it } from "vitest";
import {
  mainNavItems,
  mobileTabItems,
  moreNavItems,
  navItems,
  type NavItem,
} from "./nav-registry.js";

describe("nav-registry", () => {
  it("exports a non-empty navItems array", () => {
    expect(navItems.length).toBeGreaterThan(0);
  });

  it("every item has label, href, icon, and group", () => {
    for (const item of navItems) {
      expect(item.label, `${item.href} missing label`).toBeTruthy();
      expect(item.href, `${item.label} missing href`).toMatch(/^\//);
      expect(item.icon, `${item.label} missing icon`).toBeTruthy();
      expect(["main", "more"], `${item.label} bad group`).toContain(item.group);
    }
  });

  it("mobile tab items are a subset of navItems sorted by mobileTab", () => {
    expect(mobileTabItems.length).toBeGreaterThan(0);
    for (const tab of mobileTabItems) {
      expect(navItems.map((i: NavItem) => i.href)).toContain(tab.href);
    }
    // Sorted ascending
    const indices = mobileTabItems.map((t) => t.mobileTab);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
  });

  it("mainNavItems and moreNavItems partition navItems completely", () => {
    const allFromGroups = [...mainNavItems, ...moreNavItems];
    expect(allFromGroups.length).toBe(navItems.length);
    for (const item of navItems) {
      expect(allFromGroups.map((i: NavItem) => i.href)).toContain(item.href);
    }
  });

  it("/app is the first mobile tab", () => {
    expect(mobileTabItems[0]?.href).toBe("/app");
  });

  it("no duplicate hrefs in navItems", () => {
    const hrefs = navItems.map((i: NavItem) => i.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });

  it("all mobileTab values are unique", () => {
    const indices = mobileTabItems.map((t) => t.mobileTab);
    const unique = new Set(indices);
    expect(unique.size).toBe(indices.length);
  });
});

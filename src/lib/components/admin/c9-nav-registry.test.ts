/**
 * @phase-7.5 C9 — Sidebar diet + "Heute" → "Übersicht" rename.
 *
 * Resolves UX-001 (sidebar diet 9 → 5) and UX-040 (Heute → Übersicht).
 */

import { describe, expect, it } from "vitest";
import { mainNavItems, navItems, type NavItem } from "./nav-registry.js";

describe("C9 — sidebar diet (UX-001)", () => {
  it("mainNavItems has exactly 5 entries (down from 9)", () => {
    expect(mainNavItems.length).toBe(5);
  });

  it("the 5 main entries are: Übersicht, Audit Inbox, Transaktionen, Mitglieder, Rechnungen", () => {
    const hrefs = mainNavItems.map((i) => i.href).sort();
    expect(hrefs).toEqual(
      [
        "/app",
        "/app/inbox",
        "/app/transactions",
        "/app/mitglieder",
        "/app/rechnungen",
      ].sort(),
    );
  });

  it("sheet-resync route is NOT in any nav group (still reachable by URL)", () => {
    const hrefs = navItems.map((i: NavItem) => i.href);
    expect(hrefs).not.toContain("/app/sheet-resync");
  });

  it("Projekte, Kunden, Jahresabschluss, Einstellungen are preserved (in more group)", () => {
    const hrefs = navItems.map((i: NavItem) => i.href);
    expect(hrefs).toContain("/app/projekte");
    expect(hrefs).toContain("/app/kunden");
    expect(hrefs).toContain("/app/jahresabschluss");
    expect(hrefs).toContain("/app/einstellungen");
  });
});

describe("C9 — rename Heute → Übersicht (UX-040)", () => {
  it('no nav item is labelled "Heute"', () => {
    const labels = navItems.map((i) => i.label);
    expect(labels).not.toContain("Heute");
  });

  it('the /app route is labelled "Übersicht"', () => {
    const dashboard = navItems.find((i) => i.href === "/app");
    expect(dashboard?.label).toBe("Übersicht");
  });
});

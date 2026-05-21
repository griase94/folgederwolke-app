/**
 * @phase-7.5 C9 — Sidebar diet + "Heute" → "Übersicht" rename.
 *
 * Resolves UX-001 (sidebar diet 9 → 5) and UX-040 (Heute → Übersicht).
 *
 * 2026-05-21 Zone-A — IA shift: Projekte + Jahresabschluss promoted to
 * main group (6 entries); "Audit Inbox" renamed to "Belegprüfung";
 * Kunden + Rechnungen demoted to "more"; Mitglieder retained in main.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mainNavItems, navItems, type NavItem } from "./nav-registry.js";

describe("Zone-A — IA shift (main group has 6 entries)", () => {
  it("mainNavItems has exactly 6 entries", () => {
    expect(mainNavItems.length).toBe(6);
  });

  it("the 6 main entries are: Übersicht, Belegprüfung, Projekte, Transaktionen, Mitglieder, Jahresabschluss", () => {
    const labels = mainNavItems.map((i) => i.label).sort();
    expect(labels).toEqual(
      [
        "Übersicht",
        "Belegprüfung",
        "Projekte",
        "Transaktionen",
        "Mitglieder",
        "Jahresabschluss",
      ].sort(),
    );
  });

  it("the main-group hrefs cover the IA-shift route set", () => {
    const hrefs = mainNavItems.map((i) => i.href).sort();
    expect(hrefs).toEqual(
      [
        "/app",
        "/app/inbox",
        "/app/projekte",
        "/app/transactions",
        "/app/mitglieder",
        "/app/jahresabschluss",
      ].sort(),
    );
  });

  it("sheet-resync route is NOT in any nav group (still reachable by URL)", () => {
    const hrefs = navItems.map((i: NavItem) => i.href);
    expect(hrefs).not.toContain("/app/sheet-resync");
  });

  it("Kunden, Rechnungen, Einstellungen, DSGVO are preserved (in more group)", () => {
    const hrefs = navItems.map((i: NavItem) => i.href);
    expect(hrefs).toContain("/app/kunden");
    expect(hrefs).toContain("/app/rechnungen");
    expect(hrefs).toContain("/app/einstellungen");
    expect(hrefs).toContain("/app/dsgvo");
  });

  it('the inbox route is labelled "Belegprüfung" (not "Audit Inbox")', () => {
    const inbox = navItems.find((i) => i.href === "/app/inbox");
    expect(inbox?.label).toBe("Belegprüfung");
    const labels = navItems.map((i) => i.label);
    expect(labels).not.toContain("Audit Inbox");
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

describe("C9 — Topbar breadcrumb root rename (UX-040, cycle 2)", () => {
  // Topbar's ROUTE_LABELS map is local (not exported). Source-grep the
  // component file to guarantee the breadcrumb root matches the sidebar.
  const TOPBAR_SRC = readFileSync(
    `${process.cwd()}/src/lib/components/admin/Topbar.svelte`,
    "utf-8",
  );

  it('Topbar maps the "app" segment to "Übersicht" (not "Start")', () => {
    expect(TOPBAR_SRC).toMatch(/app:\s*'Übersicht'/);
    expect(TOPBAR_SRC).not.toMatch(/app:\s*'Start'/);
  });

  it('Topbar contains no breadcrumb label "Heute"', () => {
    expect(TOPBAR_SRC).not.toMatch(/:\s*'Heute'/);
  });
});

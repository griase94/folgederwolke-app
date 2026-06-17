/**
 * @phase-7.5 C9 — Sidebar diet + "Heute" → "Übersicht" rename.
 *
 * Resolves UX-001 (sidebar diet 9 → 5) and UX-040 (Heute → Übersicht).
 *
 * 2026-05-21 Zone-A — IA shift: Projekte + Jahresabschluss promoted to
 * main group; "Audit Inbox" renamed to "Belegprüfung"; Kunden + Rechnungen
 * demoted to "more"; Mitglieder retained in main.
 *
 * Phase 3 — the single "Transaktionen" main entry (/app/transactions) splits
 * into three flat desktop entries: Ausgaben (/app/ausgaben), Einnahmen
 * (/app/einnahmen), Spenden (/app/spenden). The desktop sidebar shows all
 * three distinct labels; the mobile bottom tab bar collapses them into a
 * single "Transaktionen" cell (Ausgaben carries mobileLabel "Transaktionen"
 * + mobileTab; its active-state spans all three via mobileTransaktionenActive).
 * Main group grows 6 → 8 entries.
 */

import { describe, expect, it } from "vitest";
import {
  mainNavItems,
  mobileTransaktionenActive,
  navItems,
  type NavItem,
} from "./nav-registry.js";

describe("Zone-A + Phase 3 — IA shift (main group has 8 entries)", () => {
  it("mainNavItems has exactly 8 entries", () => {
    expect(mainNavItems.length).toBe(8);
  });

  it("the 8 main entries are: Übersicht, Belegprüfung, Projekte, Ausgaben, Einnahmen, Spenden, Mitglieder, Jahresabschluss", () => {
    const labels = mainNavItems.map((i) => i.label).sort();
    expect(labels).toEqual(
      [
        "Übersicht",
        "Belegprüfung",
        "Projekte",
        "Ausgaben",
        "Einnahmen",
        "Spenden",
        "Mitglieder",
        "Jahresabschluss",
      ].sort(),
    );
  });

  it("the main-group hrefs cover the IA-shift route set (three flat transaction routes)", () => {
    const hrefs = mainNavItems.map((i) => i.href).sort();
    expect(hrefs).toEqual(
      [
        "/app",
        "/app/inbox",
        "/app/projekte",
        "/app/ausgaben",
        "/app/einnahmen",
        "/app/spenden",
        "/app/mitglieder",
        "/app/jahresabschluss",
      ].sort(),
    );
  });

  it("the legacy single /app/transactions route is gone from nav", () => {
    const hrefs = navItems.map((i: NavItem) => i.href);
    expect(hrefs).not.toContain("/app/transactions");
  });

  it("desktop shows three distinct transaction labels (no main 'Transaktionen' label)", () => {
    const labels = mainNavItems.map((i) => i.label);
    expect(labels).toContain("Ausgaben");
    expect(labels).toContain("Einnahmen");
    expect(labels).toContain("Spenden");
    expect(labels).not.toContain("Transaktionen");
  });

  it("mobile bottom tab collapses to a single 'Transaktionen' cell on Ausgaben", () => {
    const ausgaben = mainNavItems.find((i) => i.href === "/app/ausgaben");
    // Desktop label stays "Ausgaben"; the mobile cell renders mobileLabel.
    expect(ausgaben?.label).toBe("Ausgaben");
    expect(ausgaben?.mobileLabel).toBe("Transaktionen");
    expect(ausgaben?.mobileTab).toBeDefined();
    // Einnahmen + Spenden do not get their own mobile tab.
    expect(
      mainNavItems.find((i) => i.href === "/app/einnahmen")?.mobileTab,
    ).toBeUndefined();
    expect(
      mainNavItems.find((i) => i.href === "/app/spenden")?.mobileTab,
    ).toBeUndefined();
  });

  it("mobileTransaktionenActive lights up across all three transaction routes", () => {
    expect(mobileTransaktionenActive("/app/ausgaben")).toBe(true);
    expect(mobileTransaktionenActive("/app/einnahmen")).toBe(true);
    expect(mobileTransaktionenActive("/app/spenden/abc-123")).toBe(true);
    expect(mobileTransaktionenActive("/app/mitglieder")).toBe(false);
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

// Aurora slice 2 (Task 2.4): Topbar breadcrumbs are fully removed — the
// PageHeader mobile back slot and the sidebar carry orientation instead
// (spec §5 one-row contract, project rule: no compat shim). The C9 source-
// grep that asserted ROUTE_LABELS['app'] === 'Übersicht' is deleted here
// because ROUTE_LABELS no longer exists in Topbar.svelte.

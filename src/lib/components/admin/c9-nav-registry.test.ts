/**
 * Aurora slice 2 — nav-registry contract (spec §5 "Desktop sidebar").
 *
 * Desktop main group: Übersicht, Prüfung, Projekte, Ausgaben, Einnahmen,
 * Spenden, Mitglieder, Jahresabschluss. "Mehr" group: Rechnungen, Kunden,
 * Einstellungen, DSGVO. 'Prüfung' is THE label for /app/inbox on BOTH
 * devices (never two names for one destination — spec §5).
 *
 * The registry carries DESKTOP IA only: the mobile five-cell bar is
 * spec-fixed and hardcoded in MobileTabBar.svelte; mobileTab/mobileLabel
 * are gone. mobileTransaktionenActive() stays — the shared active-state
 * predicate for the single mobile Transaktionen cell (slice-5 flips the
 * cell's href to /app/transaktionen; the predicate keeps spanning the
 * three type routes).
 */
import { describe, expect, it } from "vitest";
import {
  mainNavItems,
  moreNavItems,
  navItems,
  mobileTransaktionenActive,
} from "./nav-registry.js";

describe("nav-registry — Aurora desktop IA (spec §5)", () => {
  it("main group holds the 8 first-class destinations", () => {
    expect(mainNavItems.map((i) => i.label)).toEqual([
      "Übersicht",
      "Prüfung",
      "Projekte",
      "Ausgaben",
      "Einnahmen",
      "Spenden",
      "Mitglieder",
      "Jahresabschluss",
    ]);
  });

  it("main-group hrefs cover the route set (three flat transaction routes stay)", () => {
    expect(mainNavItems.map((i) => i.href).sort()).toEqual(
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

  it("'Prüfung' is the one label for /app/inbox; 'Belegprüfung' is gone", () => {
    expect(navItems.find((i) => i.href === "/app/inbox")?.label).toBe(
      "Prüfung",
    );
    expect(navItems.map((i) => i.label)).not.toContain("Belegprüfung");
  });

  it("'Mehr' group: Rechnungen, Kunden, Einstellungen, DSGVO", () => {
    expect(moreNavItems.map((i) => i.label)).toEqual([
      "Rechnungen",
      "Kunden",
      "Einstellungen",
      "DSGVO",
    ]);
  });

  it("no mobile fields remain on any entry (mobile IA lives in MobileTabBar)", () => {
    for (const item of navItems) {
      expect("mobileTab" in item).toBe(false);
      expect("mobileLabel" in item).toBe(false);
    }
  });
});

describe("mobileTransaktionenActive", () => {
  it("spans the three type routes and their details", () => {
    for (const p of [
      "/app/ausgaben",
      "/app/ausgaben/abc",
      "/app/einnahmen",
      "/app/einnahmen/neu",
      "/app/spenden/x/zuwendungsbestaetigung",
    ]) {
      expect(mobileTransaktionenActive(p)).toBe(true);
    }
  });

  it("is false elsewhere (incl. prefix-collision paths)", () => {
    for (const p of [
      "/app",
      "/app/inbox",
      "/app/projekte",
      "/app/ausgabenliste",
    ]) {
      expect(mobileTransaktionenActive(p)).toBe(false);
    }
  });
});

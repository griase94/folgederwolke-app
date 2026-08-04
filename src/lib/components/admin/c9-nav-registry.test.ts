/**
 * Aurora slice 2 — nav-registry contract (spec §5 "Desktop sidebar").
 *
 * Desktop main group (spec §1 IA): Übersicht, Prüfung, Transaktionen — with
 * Einnahmen / Ausgaben / Spenden as its indented children — Mitglieder,
 * Projekte, Rechnungen, Jahresabschluss. "Mehr" group: Kunden, Dateien,
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
  navItemIsActive,
  navItemRepresents,
  hrefIsActive,
} from "./nav-registry.js";

describe("nav-registry — Aurora desktop IA (spec §5)", () => {
  it("main group holds the first-class destinations in spec order", () => {
    expect(mainNavItems.map((i) => i.label)).toEqual([
      "Übersicht",
      "Prüfung",
      "Transaktionen",
      "Mitglieder",
      "Projekte",
      "Rechnungen",
      "Jahresabschluss",
    ]);
  });

  it("the three type lists are Transaktionen's children, not flat siblings", () => {
    const tx = mainNavItems.find((i) => i.href === "/app/transaktionen");
    expect(tx?.children?.map((c) => c.label)).toEqual([
      "Einnahmen",
      "Ausgaben",
      "Spenden",
    ]);
    // …and they are no longer top-level entries.
    const topHrefs = mainNavItems.map((i) => i.href);
    for (const h of ["/app/ausgaben", "/app/einnahmen", "/app/spenden"]) {
      expect(topHrefs).not.toContain(h);
    }
  });

  it("every destination the app has a screen for is reachable from the sidebar", () => {
    const reachable = navItems.flatMap((i) => [
      i.href,
      ...(i.children ?? []).map((c) => c.href),
    ]);
    for (const href of [
      "/app",
      "/app/inbox",
      "/app/transaktionen",
      "/app/einnahmen",
      "/app/ausgaben",
      "/app/spenden",
      "/app/mitglieder",
      "/app/projekte",
      "/app/rechnungen",
      "/app/jahresabschluss",
      "/app/kunden",
      // The orphan this IA fixes: /app/files was only linked from one prose
      // sentence in the Jahresabschluss.
      "/app/files",
      "/app/einstellungen",
      "/app/dsgvo",
    ]) {
      expect(reachable).toContain(href);
    }
  });

  it("'Prüfung' is the one label for /app/inbox; 'Belegprüfung' is gone", () => {
    expect(navItems.find((i) => i.href === "/app/inbox")?.label).toBe(
      "Prüfung",
    );
    expect(navItems.map((i) => i.label)).not.toContain("Belegprüfung");
  });

  it("'Mehr' group: Kunden, Dateien, Einstellungen, DSGVO — Rechnungen promoted out", () => {
    expect(moreNavItems.map((i) => i.label)).toEqual([
      "Kunden",
      "Dateien",
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

describe("active state (spec §1: one pill at a time)", () => {
  const tx = mainNavItems.find((i) => i.href === "/app/transaktionen")!;

  it("a parent lights up for its own route and its detail routes", () => {
    expect(navItemIsActive(tx, "/app/transaktionen")).toBe(true);
    expect(navItemIsActive(tx, "/app/transaktionen?typ=spenden")).toBe(false);
  });

  it("a parent does NOT light up while one of its children is active", () => {
    for (const p of ["/app/einnahmen", "/app/ausgaben/abc", "/app/spenden"]) {
      expect(navItemIsActive(tx, p)).toBe(false);
      expect(
        tx.children!.some((c) => hrefIsActive(c.href, p)),
        `${p} lights exactly one child`,
      ).toBe(true);
    }
  });

  it("Übersicht stays exact — every /app route would otherwise match it", () => {
    const uebersicht = mainNavItems.find((i) => i.href === "/app")!;
    expect(navItemIsActive(uebersicht, "/app")).toBe(true);
    expect(navItemIsActive(uebersicht, "/app/inbox")).toBe(false);
  });

  it("a detail route keeps its list's pill lit", () => {
    expect(hrefIsActive("/app/mitglieder", "/app/mitglieder/abc")).toBe(true);
    expect(hrefIsActive("/app/kunden", "/app/kundenliste")).toBe(false);
  });
});

describe("collapsed rail (spec §1: flat tree, parent stands in)", () => {
  const tx = mainNavItems.find((i) => i.href === "/app/transaktionen")!;

  it("the parent icon lights up for its children, since they are not rendered", () => {
    for (const p of ["/app/einnahmen", "/app/ausgaben/abc", "/app/spenden"]) {
      expect(navItemRepresents(tx, p)).toBe(true);
      // …which is precisely what the expanded sidebar must NOT do.
      expect(navItemIsActive(tx, p)).toBe(false);
    }
  });

  it("a childless entry represents only itself", () => {
    const mitglieder = mainNavItems.find((i) => i.href === "/app/mitglieder")!;
    expect(navItemRepresents(mitglieder, "/app/mitglieder/x")).toBe(true);
    expect(navItemRepresents(mitglieder, "/app/projekte")).toBe(false);
  });
});

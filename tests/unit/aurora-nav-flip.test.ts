/**
 * Aurora slice 5 — tab-href flip (spec §5 phasing): the mobile cell itself is
 * hardcoded in MobileTabBar.svelte (its href flip is pinned by
 * MobileTabBar.test.ts); the registry's contribution is
 * mobileTransaktionenActive() spanning the /app/transaktionen feed prefix.
 *
 * The desktop half was re-decided by spec §1 (Andy live ruling, 28.07): the
 * feed DOES get a sidebar entry, and the three type lists become its children
 * instead of flat siblings. The three routes survive untouched — only where
 * they hang in the tree changed.
 */
import { describe, expect, it } from "vitest";
import {
  mainNavItems,
  mobileTransaktionenActive,
} from "$lib/components/admin/nav-registry.js";

describe("nav flip (Aurora slice 5)", () => {
  it("keeps the three-page split, now nested under the feed (spec §1)", () => {
    const feed = mainNavItems.find((i) => i.href === "/app/transaktionen");
    expect(
      feed,
      "the feed IS a sidebar entry since the §1 ruling",
    ).toBeDefined();
    const byLabel = Object.fromEntries(
      (feed!.children ?? []).map((c) => [c.label, c.href]),
    );
    expect(byLabel["Ausgaben"]).toBe("/app/ausgaben");
    expect(byLabel["Einnahmen"]).toBe("/app/einnahmen");
    expect(byLabel["Spenden"]).toBe("/app/spenden");
  });

  it("mobileTransaktionenActive spans feed + three type routes + details", () => {
    for (const p of [
      "/app/transaktionen",
      "/app/transaktionen/irgendwas",
      "/app/ausgaben",
      "/app/ausgaben/abc-123",
      "/app/einnahmen",
      "/app/spenden/xyz",
    ]) {
      expect(mobileTransaktionenActive(p)).toBe(true);
    }
    for (const p of [
      "/app",
      "/app/inbox",
      "/app/projekte",
      "/app/ausgabenliste",
      "/app/transaktionenliste",
    ]) {
      expect(mobileTransaktionenActive(p)).toBe(false);
    }
  });
});

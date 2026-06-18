/**
 * Aurora slice 5 — tab-href flip (spec §5 phasing), post-slice-2 shape:
 * the mobile cell itself is hardcoded in MobileTabBar.svelte (its href flip
 * is pinned by MobileTabBar.test.ts); the registry's contribution to the
 * flip is mobileTransaktionenActive() gaining the /app/transaktionen feed
 * prefix. The sidebar Ausgaben entry keeps /app/ausgaben (desktop
 * three-page split stays); the feed never gets a sidebar entry (spec §8).
 */
import { describe, expect, it } from "vitest";
import {
  mainNavItems,
  mobileTransaktionenActive,
} from "$lib/components/admin/nav-registry.js";

describe("nav flip (Aurora slice 5)", () => {
  it("the desktop sidebar keeps the three-page split (Ausgaben → /app/ausgaben)", () => {
    const ausgaben = mainNavItems.find((i) => i.label === "Ausgaben");
    expect(ausgaben).toBeDefined();
    expect(ausgaben!.href).toBe("/app/ausgaben");
    const einnahmen = mainNavItems.find((i) => i.label === "Einnahmen");
    expect(einnahmen!.href).toBe("/app/einnahmen");
    // The feed never gets a sidebar entry (spec §8).
    expect(mainNavItems.some((i) => i.href === "/app/transaktionen")).toBe(
      false,
    );
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

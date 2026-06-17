// tests/unit/nav-registry.test.ts
// Aurora slice 2: mobileLabel/mobileTab fields removed from nav-registry
// (mobile IA is hardcoded in MobileTabBar.svelte — spec §5). The canonical
// nav-registry tests live in src/lib/components/admin/c9-nav-registry.test.ts
// and src/lib/components/admin/admin.test.ts.
import { describe, it, expect } from "vitest";
import {
  mainNavItems,
  mobileTransaktionenActive,
} from "$lib/components/admin/nav-registry.js";
describe("nav registry — three tabs", () => {
  it("has Ausgaben/Einnahmen/Spenden as main desktop entries", () => {
    const hrefs = mainNavItems.map((i) => i.href);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/app/ausgaben",
        "/app/einnahmen",
        "/app/spenden",
      ]),
    );
  });
  it('desktop sidebar shows "Ausgaben" for /app/ausgaben', () => {
    const ausgaben = mainNavItems.find((i) => i.href === "/app/ausgaben");
    expect(ausgaben?.label).toBe("Ausgaben");
    // Aurora slice 2: mobileLabel removed (mobile IA lives in MobileTabBar).
  });
  it("Einnahmen + Spenden keep their distinct desktop labels", () => {
    const einnahmen = mainNavItems.find((i) => i.href === "/app/einnahmen");
    const spenden = mainNavItems.find((i) => i.href === "/app/spenden");
    expect(einnahmen?.label).toBe("Einnahmen");
    expect(spenden?.label).toBe("Spenden");
  });
  it("mobile Transaktionen tab is active on any of the three tab paths (+ their detail routes)", () => {
    expect(mobileTransaktionenActive("/app/ausgaben")).toBe(true);
    expect(mobileTransaktionenActive("/app/einnahmen/abc-123")).toBe(true);
    expect(mobileTransaktionenActive("/app/spenden")).toBe(true);
    expect(mobileTransaktionenActive("/app/mitglieder")).toBe(false);
  });
});

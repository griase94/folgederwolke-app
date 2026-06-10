// tests/unit/nav-registry.test.ts
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
  it('desktop sidebar shows "Ausgaben" for /app/ausgaben, with mobileLabel "Transaktionen"', () => {
    const ausgaben = mainNavItems.find((i) => i.href === "/app/ausgaben");
    expect(ausgaben?.label).toBe("Ausgaben");
    expect(ausgaben?.mobileLabel).toBe("Transaktionen");
  });
  it("Einnahmen + Spenden keep their distinct desktop labels and carry no mobileLabel", () => {
    const einnahmen = mainNavItems.find((i) => i.href === "/app/einnahmen");
    const spenden = mainNavItems.find((i) => i.href === "/app/spenden");
    expect(einnahmen?.label).toBe("Einnahmen");
    expect(einnahmen?.mobileLabel).toBeUndefined();
    expect(spenden?.label).toBe("Spenden");
    expect(spenden?.mobileLabel).toBeUndefined();
  });
  it("mobile Transaktionen tab is active on any of the three tab paths (+ their detail routes)", () => {
    expect(mobileTransaktionenActive("/app/ausgaben")).toBe(true);
    expect(mobileTransaktionenActive("/app/einnahmen/abc-123")).toBe(true);
    expect(mobileTransaktionenActive("/app/spenden")).toBe(true);
    expect(mobileTransaktionenActive("/app/mitglieder")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { statusPresentation } from "./status-presentation.js";
import type { AuslageStatus } from "$lib/server/domain/auslage-status.js";

describe("statusPresentation", () => {
  it("maps every deriveStatus value to a presentation", () => {
    const all: AuslageStatus[] = [
      "eingegangen",
      "in_pruefung",
      "geprueft",
      "erstattet",
      "abgelehnt",
    ];
    for (const s of all) {
      const p = statusPresentation(s);
      expect(p.medallion).toBeTruthy();
      expect(p.chip).toBeTruthy();
      expect(p.eyebrow).toBeTruthy();
      expect(p.pill).toBeTruthy();
    }
  });

  it("INVARIANT: in_pruefung is brand-neutral (chip 'open'), never a warn/crit tone (ANDY-LENS §4)", () => {
    expect(statusPresentation("in_pruefung").chip).toBe("open");
    expect(statusPresentation("eingegangen").chip).toBe("open");
    expect(statusPresentation("geprueft").chip).toBe("open");
  });

  it("erstattet is the only green (done/ok) state", () => {
    const p = statusPresentation("erstattet");
    expect(p.medallion).toBe("done");
    expect(p.chip).toBe("ok");
  });

  it("abgelehnt is the only critical (reject/crit) state", () => {
    const p = statusPresentation("abgelehnt");
    expect(p.medallion).toBe("reject");
    expect(p.chip).toBe("crit");
  });
});

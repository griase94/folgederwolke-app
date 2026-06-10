/**
 * transaction-status — the SINGLE source of truth for a transaction status's
 * German label + badge tone, shared by the desktop Ausgaben status column and
 * the mobile card so they never drift (item 7).
 *
 * Pure TS (no DB / no DOM) → normal vitest lane.
 */

import { describe, it, expect } from "vitest";
import {
  statusPresentation,
  TRANSACTION_STATUS,
} from "./transaction-status.js";

describe("transaction-status", () => {
  it("geprueft is Genehmigt with a BLUE tone (the unified desktop palette, not amber)", () => {
    const p = statusPresentation("geprueft");
    expect(p.label).toBe("Genehmigt");
    expect(p.tone).toContain("blue");
    expect(p.tone).not.toContain("amber");
  });

  it("maps the canonical statuses to their German labels", () => {
    expect(statusPresentation("zu_pruefen").label).toBe("Zu prüfen");
    expect(statusPresentation("in_pruefung").label).toBe("In Prüfung");
    expect(statusPresentation("abgelehnt").label).toBe("Abgelehnt");
    expect(statusPresentation("erstattet").label).toBe("Erstattet");
    expect(statusPresentation("importiert").label).toBe("Importiert");
  });

  it("degrades an unknown status to the raw value + neutral tone", () => {
    const p = statusPresentation("irgendwas");
    expect(p.label).toBe("irgendwas");
    expect(p.tone).toBe("bg-muted text-muted-foreground");
  });

  it("exposes a tone for every mapped status", () => {
    for (const key of Object.keys(TRANSACTION_STATUS)) {
      expect(statusPresentation(key).tone.length).toBeGreaterThan(0);
    }
  });
});

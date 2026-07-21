/**
 * @vitest-environment node
 *
 * Kategorie-Eligibility (Andy-Feedback 2026-07). The invoice form (/rechnungen
 * new + edit) filters its income-Kategorie list on `rechnungsfaehig`. This pins
 * the seeded flag set — the source of truth the load queries filter on — plus
 * Andy's two new invoiceable categories.
 */
import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";

describe("Kategorie-Eligibility (rechnungsfaehig)", () => {
  it("exposes exactly the confirmed invoiceable income Kategorien", async () => {
    const db = getDb();
    const rows = await db
      .select({ name: kategorien.name })
      .from(kategorien)
      .where(
        and(
          eq(kategorien.kind, "income"),
          eq(kategorien.rechnungsfaehig, true),
        ),
      )
      .orderBy(kategorien.name);
    expect(rows.map((r) => r.name)).toEqual([
      "Dienstleistung (allgemein)",
      "Honorar künstlerische Leistung",
      "Kuratierung & Künstlerische Leitung",
      "Sonstige Einnahme (WGB)",
      "Sonstige Einnahme (Zweckbetrieb)",
      "Sponsoring (mit Gegenleistung)",
      "Vermietung Technik",
      "Workshop / Kursgebühr",
    ]);
  });

  it("keeps donations / grants / interest / cash-desk revenue OUT of invoices", async () => {
    const db = getDb();
    const notInvoiceable = [
      "Aufnahmegebühr",
      "Bar-Umsatz",
      "Eintritt",
      "Garderobe",
      "Geldspende zweckfrei",
      "Geldspende zweckgebunden",
      "Sachspende",
      "Merch-Verkauf",
      "Sonstige Einnahme (Ideell)",
      "Zinsen",
      "Zuschuss (zweckfrei)",
      "Zuschuss (zweckgebunden)",
    ];
    for (const name of notInvoiceable) {
      const [row] = await db
        .select({ r: kategorien.rechnungsfaehig })
        .from(kategorien)
        .where(and(eq(kategorien.kind, "income"), eq(kategorien.name, name)))
        .limit(1);
      expect(row?.r, name).toBe(false);
    }
  });

  it("adds the two new invoiceable Kategorien as wirtschaftlich", async () => {
    const db = getDb();
    for (const name of ["Vermietung Technik", "Dienstleistung (allgemein)"]) {
      const [row] = await db
        .select({ sphere: kategorien.sphere, r: kategorien.rechnungsfaehig })
        .from(kategorien)
        .where(and(eq(kategorien.kind, "income"), eq(kategorien.name, name)))
        .limit(1);
      expect(row?.sphere, name).toBe("wirtschaftlich");
      expect(row?.r, name).toBe(true);
    }
  });

  it("never marks an expense Kategorie rechnungsfaehig", async () => {
    const db = getDb();
    const rows = await db
      .select({ name: kategorien.name })
      .from(kategorien)
      .where(
        and(
          eq(kategorien.kind, "expense"),
          eq(kategorien.rechnungsfaehig, true),
        ),
      );
    expect(rows).toEqual([]);
  });
});

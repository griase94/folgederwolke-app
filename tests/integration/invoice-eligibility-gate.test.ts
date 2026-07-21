/**
 * @vitest-environment node
 *
 * #154 Verifier follow-up: the `rechnungsfaehig` filter is load/dropdown-only,
 * so the invoice DOMAIN must ALSO reject a hand-POSTed non-invoiceable
 * kategorieId (a donation/grant/interest id would book the wrong sphere on
 * mark-paid). `createInvoice` returns a 422 BEFORE any business-id allocation,
 * DB write, or PDF job — a clean early return, so this needs no cleanup.
 *
 * The editInvoice gate (reject switching, allow keeping the existing Kategorie)
 * is unit-tested in tests/unit/invoice-edit.test.ts.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { createInvoice } from "$lib/server/domain/invoices.js";

async function firstId(where: string): Promise<string> {
  const db = getDb();
  const rows = (await db.execute(
    sql.raw(`SELECT id::text AS id FROM ${where} LIMIT 1`),
  )) as unknown as ReadonlyArray<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) throw new Error(`no row for: ${where}`);
  return id;
}

describe("Invoice eligibility gate — createInvoice", () => {
  it("rejects a non-rechnungsfaehig Kategorie with a 422 (tampered POST)", async () => {
    const kategorieId = await firstId(
      "kategorien WHERE kind = 'income' AND NOT rechnungsfaehig ORDER BY name",
    );
    const customerId = await firstId("customers WHERE deleted_at IS NULL");

    const result = await createInvoice(
      {
        customerId,
        kategorieId,
        rechnungsdatum: "2097-06-15",
        leistungsDatum: "2097-06-15",
        leistungszeitraum: "Juni 2097",
        bezeichnung: "Tampering-Test — nicht rechnungsfähig",
        nettoCents: 12345,
        currency: "EUR",
      },
      null,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error).toMatch(/nicht vorgesehen/i);
    }

    // Clean early return — nothing was persisted for this tampered attempt.
    const db = getDb();
    const rows = (await db.execute(
      sql`SELECT count(*)::int AS c FROM invoices WHERE rechnungsdatum = '2097-06-15'`,
    )) as unknown as ReadonlyArray<{ c: number }>;
    expect(rows[0]?.c).toBe(0);
  });
});

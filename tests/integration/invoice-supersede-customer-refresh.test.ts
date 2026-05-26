/**
 * Phase 12 — DSGVO Art. 16 Berichtigungspflicht: `supersedeInvoice` MUST
 * re-read `customers.name` + `customers.address_block` at supersede time so
 * a corrected address flows into the Storno-Neuausstellung. @phase-12
 *
 * The predecessor invoice keeps its stale snapshot (history must remain
 * immutable per ADR-0006); the new invoice picks up the corrected values.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { getDb } from "$lib/server/db/index.js";
import { supersedeInvoice } from "$lib/server/domain/invoices.js";
import { registerHandlers } from "$lib/server/events/index.js";
import {
  closeAdminConnection,
  cleanupFilesViaAdmin,
  resetFestgeschreibungBis,
} from "./_helpers/festschreibung-reset.js";

registerHandlers();

type Row<T> = ReadonlyArray<T>;

let _admin: ReturnType<typeof postgres> | null = null;
function admin(): ReturnType<typeof postgres> {
  if (_admin) return _admin;
  const url = process.env["DIRECT_DATABASE_URL"];
  if (!url) throw new Error("DIRECT_DATABASE_URL required for admin SQL");
  _admin = postgres(url, { prepare: false, max: 1 });
  return _admin;
}

async function wipeSynthetic(): Promise<void> {
  const db = getDb();
  const a = admin();
  await db.execute(
    sql`DELETE FROM invoice_jobs WHERE invoice_id IN (SELECT id FROM invoices WHERE business_id LIKE 'FDW-2098-%')`,
  );
  await a`DELETE FROM audit_log WHERE entity_business_id LIKE 'FDW-2098-%'`;
  await db.execute(
    sql`UPDATE invoices SET pdf_file_id = NULL WHERE business_id LIKE 'FDW-2098-%'`,
  );
  await db.execute(
    sql`DELETE FROM files WHERE storage_key LIKE 'rechnungen/2098/FDW-2098-%'`,
  );
  // Two-phase delete: first the successors, then the predecessors (FK to self).
  await db.execute(
    sql`DELETE FROM invoices WHERE business_id LIKE 'FDW-2098-%' AND supersedes_id IS NOT NULL`,
  );
  await db.execute(
    sql`DELETE FROM invoices WHERE business_id LIKE 'FDW-2098-%'`,
  );
  await db.execute(sql`DELETE FROM customers WHERE name LIKE 'Phase12-test-%'`);
}

describe("Phase 12 — supersedeInvoice re-reads customer name + address (DSGVO Art. 16)", () => {
  afterAll(async () => {
    if (_admin) {
      await _admin.end();
      _admin = null;
    }
    await closeAdminConnection();
  });

  beforeEach(async () => {
    await resetFestgeschreibungBis();
    await cleanupFilesViaAdmin();
    await wipeSynthetic();
  });

  it("new invoice carries the CURRENT customer name + address; predecessor keeps the old snapshot", async () => {
    const db = getDb();
    const a = admin();

    // 1. Create a fresh customer with the OLD values via admin (bypasses any
    //    customer-side triggers + audit noise).
    const oldName = "Phase12-test-Alt Name GmbH";
    const oldAddress = "Phase12-test-Alte Strasse 1\n12345 Altstadt";
    const customerRows = (await a`
      INSERT INTO customers (name, address_block, country)
      VALUES (${oldName}, ${oldAddress}, 'DE')
      RETURNING id
    `) as unknown as Row<{ id: string }>;
    const customerId = customerRows[0]!.id;

    // 2. Seed a kategorie reference for the invoice.
    const kategorien = (await db.execute(
      sql`SELECT id, name, sphere FROM kategorien WHERE kind='income' LIMIT 1`,
    )) as unknown as Row<{ id: string; name: string; sphere: string }>;
    const kat = kategorien[0]!;

    // 3. Seed an invoice with the OLD snapshot. We're testing what happens
    //    when the customer record changes BETWEEN issuance and supersede.
    const gebuchtAm = "2098-04-05 10:00:00+01";
    const invs = (await db.execute(sql`
      INSERT INTO invoices (
        business_id, source, gebucht_am, rechnungsdatum, leistungszeitraum,
        customer_id, customer_name_snapshot, customer_address_snapshot,
        netto_cents, ust_cents, brutto_cents,
        kategorie_id, kategorie_name_snapshot, sphere_snapshot,
        bezeichnung, pdf_status
      ) VALUES (
        'FDW-2098-200', 'app', ${gebuchtAm}::timestamptz, '2098-04-05', 'April 2098',
        ${customerId}::uuid, ${oldName}, ${oldAddress},
        25000, 0, 25000,
        ${kat.id}::uuid, ${kat.name}, ${kat.sphere}::sphere,
        'Supersede DSGVO-Test', 'not_generated'
      ) RETURNING id
    `)) as unknown as Row<{ id: string }>;
    const oldInvoiceId = invs[0]!.id;

    // 4. UPDATE the customer to the corrected values (DSGVO Art. 16).
    const newName = "Phase12-test-Neu Name GmbH";
    const newAddress = "Phase12-test-Neue Strasse 99\n98765 Neustadt";
    await a`
      UPDATE customers
      SET name = ${newName}, address_block = ${newAddress}
      WHERE id = ${customerId}
    `;

    // 5. Call supersedeInvoice — must re-read the customer row and snapshot
    //    the CURRENT (corrected) name + address into the new invoice.
    const result = await supersedeInvoice(oldInvoiceId, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 6. Predecessor still has the OLD snapshot (history is immutable).
    const oldInvRows = (await db.execute(sql`
      SELECT customer_name_snapshot, customer_address_snapshot
      FROM invoices WHERE id = ${oldInvoiceId}::uuid
    `)) as unknown as Row<{
      customer_name_snapshot: string;
      customer_address_snapshot: string | null;
    }>;
    expect(oldInvRows[0]!.customer_name_snapshot).toBe(oldName);
    expect(oldInvRows[0]!.customer_address_snapshot).toBe(oldAddress);

    // 7. New invoice carries the CORRECTED snapshot.
    const newInvRows = (await db.execute(sql`
      SELECT customer_name_snapshot, customer_address_snapshot, business_id
      FROM invoices WHERE id = ${result.newInvoiceId}::uuid
    `)) as unknown as Row<{
      customer_name_snapshot: string;
      customer_address_snapshot: string | null;
      business_id: string;
    }>;
    expect(newInvRows[0]!.customer_name_snapshot).toBe(newName);
    expect(newInvRows[0]!.customer_address_snapshot).toBe(newAddress);
    expect(newInvRows[0]!.business_id).toBe(result.newBusinessId);
  });
});

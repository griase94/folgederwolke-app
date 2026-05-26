/**
 * Phase 11 — invoice PDF blob persistence integration tests.
 *
 * Verifies the post-Phase-11 finalizePdfJob behaviour:
 *   - blob upload succeeds → files row written → invoices.pdf_file_id set
 *     → invoices.pdf_status='generated' → audit_log row carries sha256
 *   - regenerate (`runInvoiceJob` called a second time on the same invoice)
 *     produces a versioned pathname (`.v2.pdf`) and a new files row; the
 *     v1 files row is preserved (Festschreibung integrity)
 *   - storage=null (test-mode opt-out) still updates DB but skips blob
 *
 * Driver notes:
 *   drizzle-orm/postgres-js `db.execute(sql`…`)` returns rows as a plain
 *   array (not `{rows}`). All assertions read `arr[0].col` directly.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { InMemoryMockFileStorage } from "$lib/server/files/in-memory-mock-impl.js";
import { runInvoiceJob } from "$lib/server/domain/invoices.js";
import { registerHandlers } from "$lib/server/events/index.js";

// Phase 11: the invoice.pdf_generated audit_log anchor is written DIRECTLY
// inside finalizePdfJob (not via this bus subscriber — see ADR-0012 §6),
// so the audit assertion below works whether or not handlers are
// registered. We still register so any future best-effort handlers exercise
// under test.
registerHandlers();
import {
  resetFestgeschreibungBis,
  closeAdminConnection,
  cleanupFilesViaAdmin,
} from "./_helpers/festschreibung-reset.js";

type Row<T> = ReadonlyArray<T>;

async function seedInvoiceWithJob(opts: {
  businessId: string;
}): Promise<{ invoiceId: string; jobId: string; businessId: string }> {
  const db = getDb();
  const customers = (await db.execute(
    sql`SELECT id, name FROM customers LIMIT 1`,
  )) as unknown as Row<{ id: string; name: string }>;
  const customer = customers[0];
  if (!customer) throw new Error("seed: no customer rows");

  const kategorien = (await db.execute(
    sql`SELECT id, name, sphere FROM kategorien WHERE kind='income' LIMIT 1`,
  )) as unknown as Row<{ id: string; name: string; sphere: string }>;
  const kat = kategorien[0];
  if (!kat) throw new Error("seed: no income kategorie");

  // gebucht_am pinned to 2099 (Berlin local) so year_for_booking() returns 2099
  // and matches the FDW-2099-NNN business_id year-prefix CHECK constraint.
  const gebuchtAm = "2099-04-05 10:00:00+01";
  const invs = (await db.execute(sql`
    INSERT INTO invoices (
      business_id, source, gebucht_am, rechnungsdatum, leistungszeitraum,
      customer_id, customer_name_snapshot,
      netto_cents, ust_cents, brutto_cents,
      kategorie_id, kategorie_name_snapshot, sphere_snapshot,
      bezeichnung, pdf_status
    ) VALUES (
      ${opts.businessId}, 'app', ${gebuchtAm}::timestamptz, '2099-04-05', 'April 2099',
      ${customer.id}::uuid, ${customer.name},
      75000, 0, 75000,
      ${kat.id}::uuid, ${kat.name}, ${kat.sphere}::sphere,
      'Integrationstest Rechnung v1', 'queued'
    ) RETURNING id
  `)) as unknown as Row<{ id: string }>;
  const inv = invs[0];
  if (!inv) throw new Error("seed: invoice insert returned no row");

  const jobs = (await db.execute(sql`
    INSERT INTO invoice_jobs (invoice_id, idempotency_key, status)
    VALUES (${inv.id}::uuid, ${`invoice:${inv.id}:v1`}, 'queued')
    RETURNING id
  `)) as unknown as Row<{ id: string }>;
  const job = jobs[0];
  if (!job) throw new Error("seed: invoice_jobs insert returned no row");

  return { invoiceId: inv.id, jobId: job.id, businessId: opts.businessId };
}

describe("Phase 11 — invoice PDF blob persistence", () => {
  afterAll(async () => {
    await closeAdminConnection();
  });

  beforeEach(async () => {
    await resetFestgeschreibungBis();
    await cleanupFilesViaAdmin();
    await getDb().execute(
      sql`DELETE FROM invoice_jobs WHERE invoice_id IN (SELECT id FROM invoices WHERE business_id LIKE 'FDW-2099-%')`,
    );
    await getDb().execute(
      sql`DELETE FROM invoices WHERE business_id LIKE 'FDW-2099-%'`,
    );
  });

  it("blob upload → files row → pdf_file_id set → audit_log carries sha256", async () => {
    const storage = new InMemoryMockFileStorage();
    const seeded = await seedInvoiceWithJob({ businessId: "FDW-2099-001" });

    await runInvoiceJob(seeded.jobId, null, { storage });

    const db = getDb();
    const invs = (await db.execute(sql`
      SELECT pdf_status, pdf_file_id::text AS pdf_file_id, year_of_buchung
      FROM invoices WHERE id = ${seeded.invoiceId}::uuid
    `)) as unknown as Row<{
      pdf_status: string;
      pdf_file_id: string | null;
      year_of_buchung: number;
    }>;
    const inv = invs[0]!;
    expect(inv.pdf_status).toBe("generated");
    expect(inv.pdf_file_id).not.toBeNull();

    const files = (await db.execute(sql`
      SELECT kind, storage_key, sha256, byte_size, source_kind
      FROM files WHERE id = ${inv.pdf_file_id}::uuid
    `)) as unknown as Row<{
      kind: string;
      storage_key: string;
      sha256: string;
      byte_size: string;
      source_kind: string;
    }>;
    const file = files[0]!;
    expect(file.kind).toBe("rechnung");
    expect(file.storage_key).toBe(
      `rechnungen/${inv.year_of_buchung}/FDW-2099-001.pdf`,
    );
    expect(file.source_kind).toBe("app");
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);

    // audit_log anchor — sha256 from files row appears in the audit row
    // emitted by the invoice.pdf_generated handler.
    const audits = (await db.execute(sql`
      SELECT payload
      FROM audit_log
      WHERE entity_id = ${seeded.invoiceId}::uuid
        AND payload->>'kind' = 'pdf_generated'
      ORDER BY chain_seq DESC
      LIMIT 1
    `)) as unknown as Row<{ payload: { sha256?: string; fileId?: string } }>;
    expect(audits.length).toBe(1);
    expect(audits[0]!.payload.sha256).toBe(file.sha256);
    expect(audits[0]!.payload.fileId).toBe(inv.pdf_file_id);

    // Blob actually got the bytes — query the mock.
    const bytes = await storage.download(file.storage_key);
    expect(bytes.byteLength).toBe(Number(file.byte_size));
    expect(bytes[0]).toBe(0x25); // '%' — PDF header
  });

  it("regenerate with changed content → .v2.pdf, v1 preserved", async () => {
    const storage = new InMemoryMockFileStorage();
    const seeded = await seedInvoiceWithJob({ businessId: "FDW-2099-002" });

    // First render.
    await runInvoiceJob(seeded.jobId, null, { storage });

    const db = getDb();

    // Mutate the invoice so the regenerated PDF has different bytes (otherwise
    // sha-dedup would correctly keep the same files row — no new version).
    await db.execute(sql`
      UPDATE invoices
      SET bezeichnung = 'Integrationstest Rechnung v2 (geändert)',
          netto_cents = 99999,
          brutto_cents = 99999
      WHERE id = ${seeded.invoiceId}::uuid
    `);

    // Requeue: insert a fresh invoice_jobs row + flip invoice pdf_status
    // back to 'queued' (mirrors what regeneratePdf() does).
    const jobs = (await db.execute(sql`
      INSERT INTO invoice_jobs (invoice_id, idempotency_key, status)
      VALUES (${seeded.invoiceId}::uuid, ${`invoice:${seeded.invoiceId}:regen-${Date.now()}`}, 'queued')
      RETURNING id
    `)) as unknown as Row<{ id: string }>;
    const job2 = jobs[0]!;
    await db.execute(
      sql`UPDATE invoices SET pdf_status='queued' WHERE id = ${seeded.invoiceId}::uuid`,
    );

    await runInvoiceJob(job2.id, null, { storage });

    const invs = (await db.execute(sql`
      SELECT pdf_file_id::text AS pdf_file_id, year_of_buchung
      FROM invoices WHERE id = ${seeded.invoiceId}::uuid
    `)) as unknown as Row<{ pdf_file_id: string; year_of_buchung: number }>;
    const inv = invs[0]!;

    const fileRows = (await db.execute(sql`
      SELECT id::text AS id, storage_key
      FROM files WHERE storage_key LIKE ${`rechnungen/${inv.year_of_buchung}/FDW-2099-002%`}
      ORDER BY storage_key
    `)) as unknown as Row<{ id: string; storage_key: string }>;

    expect(fileRows.length).toBe(2);
    expect(fileRows[0]!.storage_key).toBe(
      `rechnungen/${inv.year_of_buchung}/FDW-2099-002.pdf`,
    );
    expect(fileRows[1]!.storage_key).toBe(
      `rechnungen/${inv.year_of_buchung}/FDW-2099-002.v2.pdf`,
    );
    // The invoice now points at v2.
    expect(inv.pdf_file_id).toBe(fileRows[1]!.id);
  });

  // NB: an "unchanged content → sha-dedup → single files row" assertion is
  // not testable in production because `template.ts` sets /CreationDate to
  // `new Date()` — two close-by renders embed different millisecond
  // timestamps and produce different sha256. The sha-dedup pre-check in
  // runInvoiceJob therefore acts as defence-in-depth against the
  // statistically-rare same-ms collision (which would otherwise fail the
  // active-sha UNIQUE constraint), not as a normal-path optimization.

  it("storage=null → pdf_status='generated' but pdf_file_id remains NULL", async () => {
    const seeded = await seedInvoiceWithJob({ businessId: "FDW-2099-003" });

    await runInvoiceJob(seeded.jobId, null, { storage: null });

    const db = getDb();
    const invs = (await db.execute(sql`
      SELECT pdf_status, pdf_file_id FROM invoices WHERE id = ${seeded.invoiceId}::uuid
    `)) as unknown as Row<{ pdf_status: string; pdf_file_id: string | null }>;
    expect(invs[0]!.pdf_status).toBe("generated");
    expect(invs[0]!.pdf_file_id).toBeNull();
  });
});

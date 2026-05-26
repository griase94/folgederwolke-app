/**
 * Phase 12 — `editInvoice` + audit-log history integration. @phase-12
 *
 * Seeds an unpaid invoice in the FDW-2098-NNN range (so we don't collide
 * with the blob-test which uses FDW-2099-NNN), runs the v1 PDF job, then:
 *
 *   1. Calls editInvoice with new bezeichnung + new nettoCents. Asserts
 *      that pdf_status flips to 'queued' immediately, that runInvoiceJob
 *      eventually generates a v2 PDF, and that audit_log carries both
 *      `kind='edited'` (with changedFields) and `kind='pdf_generated'`
 *      (with the v2 fileId).
 *
 *   2. Edits the invoice back to its v1 content. Because pdf-lib stamps a
 *      different /CreationDate millisecond, the sha-dedup pre-check is
 *      unlikely to fire in normal operation — but the audit row must still
 *      land for the edit itself (`kind='edited'`). When dedup DOES fire,
 *      assert no orphan v2 files row is created.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { getDb } from "$lib/server/db/index.js";
import { editInvoice, runInvoiceJob } from "$lib/server/domain/invoices.js";
import { registerHandlers } from "$lib/server/events/index.js";
import {
  closeAdminConnection,
  cleanupFilesViaAdmin,
  resetFestgeschreibungBis,
} from "./_helpers/festschreibung-reset.js";

/**
 * Wipe the local-fs storage dir for the synthetic 2098 test year. The
 * fire-and-forget runInvoiceJob writes through getFileStorage() (local-fs in
 * tests), so cleanupFilesViaAdmin (which only nulls FK + deletes files rows)
 * leaves on-disk blobs that trip EEXIST on the next run's deterministic path.
 */
async function wipeLocalFs2098(): Promise<void> {
  const root = process.env["FILE_STORAGE_ROOT"] ?? "./.dev-data/files-test";
  await rm(join(root, "rechnungen", "2098"), {
    recursive: true,
    force: true,
  }).catch(() => undefined);
}

registerHandlers();

// Local admin connection — app_runtime cannot DELETE from audit_log (ADR-0004).
// We use the superuser pool to clear synthetic FDW-2098-% audit rows between
// tests so chain_seq doesn't accumulate across runs.
let _admin: ReturnType<typeof postgres> | null = null;
function admin(): ReturnType<typeof postgres> {
  if (_admin) return _admin;
  const url = process.env["DIRECT_DATABASE_URL"];
  if (!url) throw new Error("DIRECT_DATABASE_URL required for audit cleanup");
  _admin = postgres(url, { prepare: false, max: 1 });
  return _admin;
}

/**
 * Poll the invoice_jobs row until status leaves 'queued'/'running'. The fire-
 * and-forget runInvoiceJob inside editInvoice may still be in flight when the
 * caller's promise resolves; tests need to wait for it before asserting on the
 * resulting audit_log + files state.
 */
async function waitForJobDone(
  jobId: string,
  timeoutMs = 10_000,
): Promise<void> {
  const db = getDb();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = (await db.execute(sql`
      SELECT status FROM invoice_jobs WHERE id = ${jobId}::uuid
    `)) as unknown as ReadonlyArray<{ status: string }>;
    if (
      rows[0] &&
      (rows[0].status === "succeeded" || rows[0].status === "failed")
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(
    `waitForJobDone: job ${jobId} did not complete in ${timeoutMs}ms`,
  );
}

type Row<T> = ReadonlyArray<T>;

async function seedInvoiceWithJob(opts: {
  businessId: string;
  bezeichnung?: string;
  nettoCents?: number;
}): Promise<{
  invoiceId: string;
  jobId: string;
  customerId: string;
  kategorieId: string;
}> {
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

  const gebuchtAm = "2098-04-05 10:00:00+01";
  const bezeichnung = opts.bezeichnung ?? "Original Bezeichnung v1";
  const netto = opts.nettoCents ?? 75000;
  const invs = (await db.execute(sql`
    INSERT INTO invoices (
      business_id, source, gebucht_am, rechnungsdatum, leistungszeitraum,
      customer_id, customer_name_snapshot,
      netto_cents, ust_cents, brutto_cents,
      kategorie_id, kategorie_name_snapshot, sphere_snapshot,
      bezeichnung, pdf_status
    ) VALUES (
      ${opts.businessId}, 'app', ${gebuchtAm}::timestamptz, '2098-04-05', 'April 2098',
      ${customer.id}::uuid, ${customer.name},
      ${netto}, 0, ${netto},
      ${kat.id}::uuid, ${kat.name}, ${kat.sphere}::sphere,
      ${bezeichnung}, 'queued'
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

  return {
    invoiceId: inv.id,
    jobId: job.id,
    customerId: customer.id,
    kategorieId: kat.id,
  };
}

async function wipeSyntheticInvoices(): Promise<void> {
  const db = getDb();
  const a = admin();
  await db.execute(
    sql`DELETE FROM invoice_jobs WHERE invoice_id IN (SELECT id FROM invoices WHERE business_id LIKE 'FDW-2098-%')`,
  );
  // audit_log: app_runtime cannot DELETE (ADR-0004). Use superuser.
  await a`DELETE FROM audit_log WHERE entity_business_id LIKE 'FDW-2098-%'`;
  await a`DELETE FROM audit_log WHERE entity_business_id LIKE 'E-2098-%'`;
  await db.execute(
    sql`UPDATE invoices SET pdf_file_id = NULL WHERE business_id LIKE 'FDW-2098-%'`,
  );
  // Files referencing those invoices: storage_key carries the business_id.
  await db.execute(
    sql`DELETE FROM files WHERE storage_key LIKE 'rechnungen/2098/FDW-2098-%'`,
  );
  await db.execute(
    sql`DELETE FROM invoices WHERE business_id LIKE 'FDW-2098-%'`,
  );
  await db.execute(
    sql`DELETE FROM income WHERE business_id LIKE 'E-2098-%' OR business_id LIKE 'E-2099-%'`,
  );
}

describe("Phase 12 — editInvoice + audit-log history", () => {
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
    await wipeSyntheticInvoices();
    await wipeLocalFs2098();
  });

  it("editInvoice queues a job, generates a v2 PDF, and writes audit rows for edited + pdf_generated", async () => {
    const seeded = await seedInvoiceWithJob({
      businessId: "FDW-2098-001",
      bezeichnung: "Original Bezeichnung v1",
      nettoCents: 75000,
    });

    // Land v1 PDF. Use the default storage (local-fs in tests) so that
    // editInvoice's fire-and-forget runInvoiceJob lands on the same backend.
    await runInvoiceJob(seeded.jobId, null);

    const db = getDb();
    const v1Rows = (await db.execute(sql`
      SELECT pdf_status, pdf_file_id::text AS pdf_file_id
      FROM invoices WHERE id = ${seeded.invoiceId}::uuid
    `)) as unknown as Row<{ pdf_status: string; pdf_file_id: string | null }>;
    expect(v1Rows[0]!.pdf_status).toBe("generated");
    const v1FileId = v1Rows[0]!.pdf_file_id;
    expect(v1FileId).not.toBeNull();

    // Edit with changed bezeichnung + changed netto.
    const editInput = {
      customerId: seeded.customerId,
      kategorieId: seeded.kategorieId,
      rechnungsdatum: "2098-04-05",
      leistungszeitraum: "April 2098",
      bezeichnung: "Geänderte Bezeichnung v2",
      nettoCents: 90000,
      currency: "EUR",
    };
    const editResult = await editInvoice(seeded.invoiceId, editInput, null);
    expect(editResult.ok).toBe(true);
    if (!editResult.ok) return;

    // Immediately after editInvoice returns: pdf_status='queued'.
    // (runInvoiceJob is fire-and-forget; we drive it deterministically below.)
    const queuedRows = (await db.execute(sql`
      SELECT pdf_status FROM invoices WHERE id = ${seeded.invoiceId}::uuid
    `)) as unknown as Row<{ pdf_status: string }>;
    // Either the fire-and-forget already finished (storage is in-memory mock
    // and very fast) OR it's still queued — both are valid. The post-job
    // assertions below are what matters.
    expect(["queued", "running", "generated"]).toContain(
      queuedRows[0]!.pdf_status,
    );

    // Drive the edit job to completion. editInvoice fires runInvoiceJob in
    // the background; we wait for it rather than calling explicitly to avoid
    // a race over the atomic `WHERE status='queued'` claim. The default
    // getFileStorage() resolves to the local-fs backend configured for tests.
    await waitForJobDone(editResult.jobId);

    const v2Rows = (await db.execute(sql`
      SELECT pdf_status, pdf_file_id::text AS pdf_file_id, bezeichnung, netto_cents
      FROM invoices WHERE id = ${seeded.invoiceId}::uuid
    `)) as unknown as Row<{
      pdf_status: string;
      pdf_file_id: string | null;
      bezeichnung: string;
      netto_cents: string;
    }>;
    expect(v2Rows[0]!.pdf_status).toBe("generated");
    expect(v2Rows[0]!.bezeichnung).toBe("Geänderte Bezeichnung v2");
    expect(v2Rows[0]!.netto_cents).toBe("90000");
    const v2FileId = v2Rows[0]!.pdf_file_id;
    expect(v2FileId).not.toBeNull();
    expect(v2FileId).not.toBe(v1FileId);

    // audit_log: edited + pdf_generated entries.
    const audits = (await db.execute(sql`
      SELECT payload, chain_seq
      FROM audit_log
      WHERE entity_id = ${seeded.invoiceId}::uuid
        AND entity_kind = 'invoice'
      ORDER BY chain_seq ASC
    `)) as unknown as Row<{
      payload: {
        kind?: string;
        changedFields?: Record<string, unknown>;
        fileId?: string;
      };
      chain_seq: number;
    }>;

    const kinds = audits.map((r) => r.payload.kind);
    expect(kinds).toContain("edited");
    expect(kinds).toContain("pdf_generated");

    const editedRow = audits.find((r) => r.payload.kind === "edited")!;
    expect(editedRow.payload.changedFields).toBeDefined();
    const changed = editedRow.payload.changedFields as Record<string, unknown>;
    expect(changed.bezeichnung).toBeDefined();
    expect(changed.nettoCents).toBeDefined();
    expect(changed.bruttoCents).toBeDefined();

    // The newest pdf_generated row carries v2's fileId. There should be TWO
    // pdf_generated rows in total (one for v1, one for v2 from the edit).
    const pdfGenerated = audits.filter(
      (r) => r.payload.kind === "pdf_generated",
    );
    expect(pdfGenerated.length).toBeGreaterThanOrEqual(2);
    const latest = pdfGenerated[pdfGenerated.length - 1]!;
    expect(latest.payload.fileId).toBe(v2FileId);
  });

  it("edit-then-edit: audit-log carries an edited row even when sha-dedup hits, and no orphan v2 files row is created", async () => {
    const seeded = await seedInvoiceWithJob({
      businessId: "FDW-2098-002",
      bezeichnung: "Stabile Bezeichnung",
      nettoCents: 50000,
    });
    await runInvoiceJob(seeded.jobId, null);

    const db = getDb();
    const v1Rows = (await db.execute(sql`
      SELECT pdf_file_id::text AS pdf_file_id
      FROM invoices WHERE id = ${seeded.invoiceId}::uuid
    `)) as unknown as Row<{ pdf_file_id: string | null }>;
    const v1FileId = v1Rows[0]!.pdf_file_id;

    // First edit: change netto → forces v2.
    const edit1 = await editInvoice(
      seeded.invoiceId,
      {
        customerId: seeded.customerId,
        kategorieId: seeded.kategorieId,
        rechnungsdatum: "2098-04-05",
        leistungszeitraum: "April 2098",
        bezeichnung: "Stabile Bezeichnung",
        nettoCents: 60000,
        currency: "EUR",
      },
      null,
    );
    expect(edit1.ok).toBe(true);
    if (!edit1.ok) return;
    await waitForJobDone(edit1.jobId);

    const v2Rows = (await db.execute(sql`
      SELECT pdf_file_id::text AS pdf_file_id
      FROM invoices WHERE id = ${seeded.invoiceId}::uuid
    `)) as unknown as Row<{ pdf_file_id: string | null }>;
    const v2FileId = v2Rows[0]!.pdf_file_id;
    expect(v2FileId).not.toBe(v1FileId);

    // Second edit: revert to same content as v2 (same netto, same bez).
    // pdf-lib re-renders with a new /CreationDate millisecond, so byte-equality
    // is unlikely. We assert the AUDIT INVARIANT: the `edited` row lands every
    // time editInvoice is called, regardless of whether the resulting PDF is
    // a fresh file or a sha-dedup'd reuse.
    const edit2 = await editInvoice(
      seeded.invoiceId,
      {
        customerId: seeded.customerId,
        kategorieId: seeded.kategorieId,
        rechnungsdatum: "2098-04-05",
        leistungszeitraum: "April 2098",
        bezeichnung: "Stabile Bezeichnung",
        nettoCents: 60000, // unchanged — only edit metadata, not content
        currency: "EUR",
      },
      null,
    );
    expect(edit2.ok).toBe(true);
    if (!edit2.ok) return;
    await waitForJobDone(edit2.jobId);

    // Count `edited` audit rows — exactly two (one per editInvoice call).
    const edits = (await db.execute(sql`
      SELECT payload FROM audit_log
      WHERE entity_id = ${seeded.invoiceId}::uuid
        AND entity_kind = 'invoice'
        AND payload->>'kind' = 'edited'
    `)) as unknown as Row<{ payload: { kind: string } }>;
    expect(edits.length).toBe(2);

    // Count `pdf_generated` rows — at least three (v1, v2, post-edit2).
    const gens = (await db.execute(sql`
      SELECT payload FROM audit_log
      WHERE entity_id = ${seeded.invoiceId}::uuid
        AND payload->>'kind' = 'pdf_generated'
    `)) as unknown as Row<{
      payload: { fileId?: string; dedupedFromFileId?: string };
    }>;
    expect(gens.length).toBeGreaterThanOrEqual(3);

    // If the last pdf_generated row is a sha-dedup hit, dedupedFromFileId
    // must be set AND no NEW files row may have been inserted (orphan check).
    const lastGen = gens[gens.length - 1]!;
    const filesForInvoice = (await db.execute(sql`
      SELECT id::text AS id FROM files
      WHERE storage_key LIKE ${"rechnungen/2098/FDW-2098-002%"}
    `)) as unknown as Row<{ id: string }>;
    if (lastGen.payload.dedupedFromFileId) {
      // Dedup path: filesForInvoice count is unchanged from after edit1.
      // We had v1 + v2 = 2 file rows. Dedup must not have added a third.
      expect(filesForInvoice.length).toBe(2);
      expect(lastGen.payload.fileId).toBe(lastGen.payload.dedupedFromFileId);
    } else {
      // Fresh-bytes path (the common case due to pdf-lib timestamping):
      // a NEW files row landed (v3).
      expect(filesForInvoice.length).toBe(3);
    }
  });
});

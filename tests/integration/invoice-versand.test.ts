// @vitest-environment node
/**
 * E-PR3 — `sendInvoiceMail` + invoice.versendet handler integration. @aurora-impl-e3
 *
 * NOTE: node environment (not the default happy-dom) — the invoice.versendet
 * handler renders the mail template via svelte/server, which only works in a
 * pure Node env (matches mail-render.test.ts). In production the SvelteKit
 * node adapter provides the same env, so this is a test-harness concern only.
 *
 * Exercises the full send dispatch against a real Postgres + the local-fs
 * FileStorage (STORAGE_BACKEND=local-fs) + the no-op mail provider
 * (MAIL_PROVIDER=no-op), asserting the ADR-0005 idempotency contract that the
 * detail page's send action relies on:
 *
 *   - a real generated-PDF invoice (rendered via runInvoiceJob) can be sent →
 *     exactly ONE sent_mails row (invoice_versendet, entity=invoice, attempt 0,
 *     status 'sent', to = the customer's email) + a kind='versendet' audit row
 *   - a second send WITHOUT resend is an idempotent no-op (no second row)
 *   - a deliberate resend increments send_attempt (second row, attempt 1)
 *   - the gate guards: no PDF → 409 "PDF muss zuerst erzeugt werden";
 *     no customer email → 409 "keine E-Mail-Adresse hinterlegt".
 *
 * The e2e (@aurora-impl-e3) covers the reachable UI gates; the send round-trip
 * itself is asserted here because generating the PDF via the fire-and-forget
 * job is not deterministic through the built e2e server.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { getDb } from "$lib/server/db/index.js";
import { runInvoiceJob, sendInvoiceMail } from "$lib/server/domain/invoices.js";
import { registerHandlers } from "$lib/server/events/index.js";

registerHandlers();

type Row<T> = ReadonlyArray<T>;

let _admin: ReturnType<typeof postgres> | null = null;
function admin(): ReturnType<typeof postgres> {
  if (_admin) return _admin;
  const url = process.env["DIRECT_DATABASE_URL"];
  if (!url) throw new Error("DIRECT_DATABASE_URL required for cleanup");
  _admin = postgres(url, { prepare: false, max: 1 });
  return _admin;
}

const BUSINESS_ID = "FDW-2097-701";
let invoiceId = "";
let customerEmail = "";

async function seedGeneratedInvoice(): Promise<void> {
  const db = getDb();

  const customers = (await db.execute(
    sql`SELECT id, name, email FROM customers WHERE email IS NOT NULL AND deleted_at IS NULL LIMIT 1`,
  )) as unknown as Row<{ id: string; name: string; email: string }>;
  const customer = customers[0]!;
  customerEmail = customer.email.toLowerCase().trim();

  const kategorien = (await db.execute(
    sql`SELECT id, name, sphere FROM kategorien WHERE kind='income' LIMIT 1`,
  )) as unknown as Row<{ id: string; name: string; sphere: string }>;
  const kat = kategorien[0]!;

  const invs = (await db.execute(sql`
    INSERT INTO invoices (
      business_id, source, gebucht_am, rechnungsdatum, leistungszeitraum,
      customer_id, customer_name_snapshot,
      netto_cents, ust_cents, brutto_cents,
      kategorie_id, kategorie_name_snapshot, sphere_snapshot,
      bezeichnung, pdf_status
    ) VALUES (
      ${BUSINESS_ID}, 'app', '2097-04-05 10:00:00+01'::timestamptz, '2097-04-05', 'April 2097',
      ${customer.id}::uuid, ${customer.name},
      9900, 0, 9900,
      ${kat.id}::uuid, ${kat.name}, ${kat.sphere}::sphere,
      'Versand-Test Rechnung', 'queued'
    ) RETURNING id
  `)) as unknown as Row<{ id: string }>;
  invoiceId = invs[0]!.id;

  const jobs = (await db.execute(sql`
    INSERT INTO invoice_jobs (invoice_id, idempotency_key, status)
    VALUES (${invoiceId}::uuid, ${`invoice:${invoiceId}:versand-test`}, 'queued')
    RETURNING id
  `)) as unknown as Row<{ id: string }>;

  // Render the real PDF into local-fs and flip pdf_status → 'generated'.
  await runInvoiceJob(jobs[0]!.id, null);
}

async function wipe(): Promise<void> {
  const a = admin();
  const rows = (await a`
    SELECT id, pdf_file_id FROM invoices WHERE business_id = ${BUSINESS_ID}
  `) as unknown as Row<{ id: string; pdf_file_id: string | null }>;
  for (const r of rows) {
    await a`DELETE FROM sent_mails WHERE entity_kind='invoice' AND entity_id=${r.id}::uuid`;
    await a`DELETE FROM audit_log WHERE entity_kind='invoice' AND entity_id=${r.id}::uuid`;
    await a`DELETE FROM invoice_jobs WHERE invoice_id=${r.id}::uuid`;
    await a`DELETE FROM invoices WHERE id=${r.id}::uuid`;
    if (r.pdf_file_id) {
      await a`DELETE FROM audit_log WHERE entity_kind='file' AND entity_id=${r.pdf_file_id}::uuid`;
      await a`DELETE FROM files WHERE id=${r.pdf_file_id}::uuid`;
    }
  }
}

async function sentMailCount(): Promise<
  Array<{ send_attempt: number; status: string; to_canonical: string }>
> {
  const db = getDb();
  const rows = (await db.execute(sql`
    SELECT send_attempt, status, to_canonical
      FROM sent_mails
     WHERE template='invoice_versendet' AND entity_kind='invoice' AND entity_id=${invoiceId}::uuid
     ORDER BY send_attempt
  `)) as unknown as Row<{
    send_attempt: number;
    status: string;
    to_canonical: string;
  }>;
  return rows.map((r) => ({
    send_attempt: Number(r.send_attempt),
    status: r.status,
    to_canonical: r.to_canonical,
  }));
}

describe("@aurora-impl-e3 sendInvoiceMail — dispatch + idempotency", () => {
  beforeAll(async () => {
    await wipe();
    await seedGeneratedInvoice();
  });

  afterAll(async () => {
    await wipe();
    if (_admin) await _admin.end();
  });

  it("renders a real PDF so the invoice is sendable", async () => {
    const db = getDb();
    const rows = (await db.execute(sql`
      SELECT pdf_status, pdf_file_id FROM invoices WHERE id=${invoiceId}::uuid
    `)) as unknown as Row<{ pdf_status: string; pdf_file_id: string | null }>;
    expect(rows[0]!.pdf_status).toBe("generated");
    expect(rows[0]!.pdf_file_id).toBeTruthy();
  });

  it("first send writes exactly one sent_mails row (attempt 0, sent) + versendet audit", async () => {
    const res = await sendInvoiceMail(invoiceId, { resend: false }, null);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.deduped).toBe(false);
      expect(res.sendAttempt).toBe(0);
    }

    const rows = await sentMailCount();
    expect(rows.length).toBe(1);
    expect(rows[0]!.send_attempt).toBe(0);
    expect(rows[0]!.status).toBe("sent");
    expect(rows[0]!.to_canonical).toBe(customerEmail);

    const db = getDb();
    const audit = (await db.execute(sql`
      SELECT payload FROM audit_log
       WHERE entity_kind='invoice' AND entity_id=${invoiceId}::uuid
         AND payload->>'kind' = 'versendet'
    `)) as unknown as Row<{ payload: { kind: string; to: string } }>;
    expect(audit.length).toBe(1);
    expect(audit[0]!.payload.to).toBe(customerEmail);
  });

  it("re-send WITHOUT confirm is an idempotent no-op (no second row)", async () => {
    const res = await sendInvoiceMail(invoiceId, { resend: false }, null);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.deduped).toBe(true);
    const rows = await sentMailCount();
    expect(rows.length).toBe(1);
  });

  it("a deliberate resend increments send_attempt (second row, attempt 1)", async () => {
    const res = await sendInvoiceMail(invoiceId, { resend: true }, null);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.deduped).toBe(false);
      expect(res.sendAttempt).toBe(1);
    }
    const rows = await sentMailCount();
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.send_attempt)).toEqual([0, 1]);
  });

  it("gate: an invoice without a PDF cannot be sent (409)", async () => {
    const db = getDb();
    const customers = (await db.execute(
      sql`SELECT id, name FROM customers WHERE email IS NOT NULL AND deleted_at IS NULL LIMIT 1`,
    )) as unknown as Row<{ id: string; name: string }>;
    const kat = (await db.execute(
      sql`SELECT id, name, sphere FROM kategorien WHERE kind='income' LIMIT 1`,
    )) as unknown as Row<{ id: string; name: string; sphere: string }>;
    const noPdf = (await db.execute(sql`
      INSERT INTO invoices (
        business_id, source, gebucht_am, rechnungsdatum, leistungszeitraum,
        customer_id, customer_name_snapshot, netto_cents, ust_cents, brutto_cents,
        kategorie_id, kategorie_name_snapshot, sphere_snapshot, bezeichnung, pdf_status
      ) VALUES (
        'FDW-2097-702', 'app', '2097-04-06 10:00:00+01'::timestamptz, '2097-04-06', 'April 2097',
        ${customers[0]!.id}::uuid, ${customers[0]!.name}, 5000, 0, 5000,
        ${kat[0]!.id}::uuid, ${kat[0]!.name}, ${kat[0]!.sphere}::sphere,
        'Ohne PDF', 'not_generated'
      ) RETURNING id
    `)) as unknown as Row<{ id: string }>;
    try {
      const res = await sendInvoiceMail(noPdf[0]!.id, { resend: false }, null);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(409);
        expect(res.error).toMatch(/PDF muss zuerst erzeugt werden/);
      }
    } finally {
      await admin()`DELETE FROM invoices WHERE id=${noPdf[0]!.id}::uuid`;
    }
  });

  it("gate: an invoice whose customer has no email cannot be sent (409)", async () => {
    const a = admin();
    const db = getDb();
    // A customer with no email (canon leaves Kulturkreis/Altpapier email-less).
    const noEmail = (await db.execute(
      sql`SELECT id, name FROM customers WHERE email IS NULL AND deleted_at IS NULL LIMIT 1`,
    )) as unknown as Row<{ id: string; name: string }>;
    const kat = (await db.execute(
      sql`SELECT id, name, sphere FROM kategorien WHERE kind='income' LIMIT 1`,
    )) as unknown as Row<{ id: string; name: string; sphere: string }>;
    // Render a real PDF so the invoice passes the PDF gate and reaches the
    // email gate (pdf_file_id must be non-null for the guard to move on).
    const inv = (await db.execute(sql`
      INSERT INTO invoices (
        business_id, source, gebucht_am, rechnungsdatum, leistungszeitraum,
        customer_id, customer_name_snapshot, netto_cents, ust_cents, brutto_cents,
        kategorie_id, kategorie_name_snapshot, sphere_snapshot, bezeichnung, pdf_status
      ) VALUES (
        'FDW-2097-703', 'app', '2097-04-07 10:00:00+01'::timestamptz, '2097-04-07', 'April 2097',
        ${noEmail[0]!.id}::uuid, ${noEmail[0]!.name}, 5000, 0, 5000,
        ${kat[0]!.id}::uuid, ${kat[0]!.name}, ${kat[0]!.sphere}::sphere,
        'Kunde ohne Mail', 'queued'
      ) RETURNING id
    `)) as unknown as Row<{ id: string }>;
    const invId = inv[0]!.id;
    const job = (await db.execute(sql`
      INSERT INTO invoice_jobs (invoice_id, idempotency_key, status)
      VALUES (${invId}::uuid, ${`invoice:${invId}:noemail-test`}, 'queued')
      RETURNING id
    `)) as unknown as Row<{ id: string }>;
    await runInvoiceJob(job[0]!.id, null);
    try {
      const res = await sendInvoiceMail(invId, { resend: false }, null);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(409);
        expect(res.error).toMatch(/keine E-Mail-Adresse hinterlegt/);
      }
    } finally {
      const fids = (await a`
        SELECT pdf_file_id FROM invoices WHERE id=${invId}::uuid
      `) as unknown as Row<{ pdf_file_id: string | null }>;
      await a`DELETE FROM invoice_jobs WHERE invoice_id=${invId}::uuid`;
      await a`DELETE FROM audit_log WHERE entity_kind='invoice' AND entity_id=${invId}::uuid`;
      await a`DELETE FROM invoices WHERE id=${invId}::uuid`;
      const fid = fids[0]?.pdf_file_id;
      if (fid) {
        await a`DELETE FROM audit_log WHERE entity_kind='file' AND entity_id=${fid}::uuid`;
        await a`DELETE FROM files WHERE id=${fid}::uuid`;
      }
    }
  });
});

/**
 * White-label Phase 1 — Task 1.4: invoice render model sources the Verein
 * address (and Steuernummer / Vereinsregister) from settings via
 * readStammdaten(), NOT from the hardcoded `env.VEREIN_ADRESSE ||
 * "Westermuehlstrasse 6\n80469 Muenchen"` literal.
 *
 * Drives the real `runInvoiceJob` → `loadRenderInput` → renderer path with a
 * capturing renderer so we observe the exact `verein` block the renderer
 * receives. With `verein.adresse` / `verein.steuernummer` / `verein.vr` rows
 * in settings, those values must flow through unchanged.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { runInvoiceJob } from "$lib/server/domain/invoices.js";
import type { InvoicePdfRenderer } from "$lib/server/pdf/invoice.js";
import type {
  InvoiceRenderInput,
  InvoiceRenderOutput,
} from "$lib/server/pdf/invoice.js";
import { registerHandlers } from "$lib/server/events/index.js";

registerHandlers();

import {
  resetFestgeschreibungBis,
  closeAdminConnection,
  cleanupFilesViaAdmin,
} from "./_helpers/festschreibung-reset.js";

type Row<T> = ReadonlyArray<T>;

/** Renderer that records the render input and returns a minimal PDF buffer. */
class CapturingRenderer implements InvoicePdfRenderer {
  public last: InvoiceRenderInput | null = null;
  async render(input: InvoiceRenderInput): Promise<InvoiceRenderOutput> {
    this.last = input;
    return {
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // "%PDF"
      suggestedFilename: "test.pdf",
      mimeType: "application/pdf",
    };
  }
}

async function seedInvoiceWithJob(opts: {
  businessId: string;
}): Promise<{ invoiceId: string; jobId: string }> {
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
      'Whitelabel Adress-Test v1', 'queued'
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

  return { invoiceId: inv.id, jobId: job.id };
}

describe("Task 1.4 — invoice verein block sources address from settings", () => {
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
    await getDb().execute(
      sql`DELETE FROM settings WHERE key IN ('verein.adresse', 'verein.steuernummer', 'verein.vr')`,
    );
  });

  it("renders verein.adresse / steuernummer / vereinsregister from settings, not the München literal", async () => {
    const db = getDb();
    await db.execute(sql`
      INSERT INTO settings (key, value) VALUES
        ('verein.adresse', '"Musterweg 1\\n12345 Musterstadt"'::jsonb),
        ('verein.steuernummer', '"99/999/99999"'::jsonb),
        ('verein.vr', '"VR 777777"'::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `);

    const renderer = new CapturingRenderer();
    const seeded = await seedInvoiceWithJob({ businessId: "FDW-2099-041" });
    await runInvoiceJob(seeded.jobId, null, { renderer, storage: null });

    const verein = renderer.last?.verein;
    expect(verein).toBeTruthy();
    expect(verein!.adresse).toBe("Musterweg 1\n12345 Musterstadt");
    expect(verein!.adresse).not.toContain("Westermuehl");
    expect(verein!.adresse).not.toContain("Muenchen");
    expect(verein!.steuernummer).toBe("99/999/99999");
    expect(verein!.vereinsregister).toBe("VR 777777");
  });
});

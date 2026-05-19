/**
 * Invoices (Ausgangsrechnungen) domain layer.
 *
 * Pure-ish functions that operate on the DB. Coordinates:
 *   - Zod validation (createInvoiceSchema)
 *   - Business-ID allocation via id-allocator (FDW-{YYYY}-{NNN})
 *   - Festschreibung gate (ADR-0006)
 *   - PDF rendering via the InvoicePdfRenderer interface (pdf-lib default)
 *   - Best-effort Drive upload via the FileStorage interface
 *   - Async job state machine (invoice_jobs)
 *   - Event bus emissions (invoice.created, invoice.pdf_generated,
 *     invoice.superseded)
 *
 * The PDF generation is engine-agnostic — see §4.1.1 #4. We never reach into
 * a Drive Doc template because the OAuth scope is `drive.file` (the app can
 * only access files it created itself). pdf-lib builds the PDF entirely
 * from the data passed in.
 *
 * If Drive upload fails, `pdf_bytes` still holds the PDF and `drive_status`
 * is set to 'failed' — the app can serve the bytes directly. Drive becomes
 * optional convenience storage, not load-bearing.
 */

import { sql, and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "$lib/server/db/index.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { invoiceJobs } from "$lib/server/db/schema/invoice_jobs.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { driveFileStorage } from "$lib/server/files/drive-impl.js";
import type { FileStorage } from "$lib/server/files/storage.js";
import { bus } from "$lib/server/events/index.js";
import { env } from "$lib/server/env.js";
import { pdfLibInvoiceRenderer } from "$lib/server/pdf/pdf-lib-renderer.js";
import type {
  InvoicePdfRenderer,
  InvoiceRenderInput,
} from "$lib/server/pdf/invoice.js";

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type CreateInvoiceFailure = {
  ok: false;
  status: number;
  error?: string;
  errors?: Record<string, string[]>;
  values?: Record<string, unknown>;
};

export type CreateInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      businessId: string;
      jobId: string;
    }
  | CreateInvoiceFailure;

export type RegeneratePdfResult =
  | { ok: true; invoiceId: string; jobId: string }
  | { ok: false; status: number; error: string };

export type SupersedeInvoiceResult =
  | {
      ok: true;
      newInvoiceId: string;
      newBusinessId: string;
      jobId: string;
    }
  | { ok: false; status: number; error: string };

// ---------------------------------------------------------------------------
// Zod schema for createInvoice
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const createInvoiceSchema = z
  .object({
    customerId: z.string().uuid("Bitte Kund:in auswaehlen"),
    projectId: z
      .string()
      .uuid("Ungueltige Projekt-ID")
      .optional()
      .or(z.literal("")),
    kategorieId: z
      .string()
      .uuid("Ungueltige Kategorie-ID")
      .optional()
      .or(z.literal("")),
    rechnungsdatum: z
      .string()
      .regex(ISO_DATE, "Rechnungsdatum im Format JJJJ-MM-TT")
      .optional()
      .transform((v) => v || new Date().toISOString().slice(0, 10)),
    leistungsDatum: z
      .string()
      .regex(ISO_DATE, "Leistungsdatum im Format JJJJ-MM-TT")
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    faelligkeitsDatum: z
      .string()
      .regex(ISO_DATE, "Faelligkeitsdatum im Format JJJJ-MM-TT")
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : null)),
    bezeichnung: z
      .string()
      .min(3, "Bezeichnung muss mindestens 3 Zeichen haben")
      .max(200, "Bezeichnung zu lang"),
    leistungsBeschreibung: z
      .string()
      .max(2000, "Leistungsbeschreibung zu lang")
      .optional()
      .or(z.literal("")),
    nettoCents: z.coerce
      .number()
      .int("Betrag muss ganzzahlig in Cent sein")
      .positive("Betrag muss positiv sein")
      .max(10_000_000_00, "Betrag ueberschreitet Limit"),
    currency: z
      .string()
      .length(3, "ISO-4217-Code: 3 Buchstaben")
      .default("EUR"),
  })
  .strict();

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export function validateCreateInvoice(
  raw: unknown,
):
  | { ok: true; data: CreateInvoiceInput }
  | { ok: false; errors: Record<string, string[]> } {
  const result = createInvoiceSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_root";
    (errors[key] ??= []).push(issue.message);
  }
  return { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Festschreibung gate
// ---------------------------------------------------------------------------

async function fetchFestgeschriebenBis(): Promise<number | null> {
  const db = getDb();
  const rows = await db.execute<{ value: unknown }>(
    sql`SELECT value FROM settings WHERE key = 'festgeschrieben_bis'`,
  );
  const row = (rows as { value: unknown }[])[0];
  if (!row) return null;
  const v = row.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v.replace(/^"|"$/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function yearOf(iso: string): number {
  const y = parseInt(iso.slice(0, 4), 10);
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

// ---------------------------------------------------------------------------
// createInvoice
// ---------------------------------------------------------------------------

export async function createInvoice(
  raw: unknown,
  actorUserId: string | null,
): Promise<CreateInvoiceResult> {
  const validation = validateCreateInvoice(raw);
  if (!validation.ok) {
    return {
      ok: false,
      status: 422,
      errors: validation.errors,
      values: (raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {}) as Record<string, unknown>,
    };
  }
  const input = validation.data;
  const db = getDb();

  const year = yearOf(input.rechnungsdatum);
  const festBis = await fetchFestgeschriebenBis();
  if (festBis !== null && year <= festBis) {
    return {
      ok: false,
      status: 409,
      error: `Jahr ${year} ist festgeschrieben - keine neuen Rechnungen moeglich`,
    };
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, input.customerId))
    .limit(1);
  if (!customer) {
    return { ok: false, status: 404, error: "Kund:in nicht gefunden" };
  }

  let kategorieNameSnapshot = "(Unkategorisiert)";
  let sphereSnapshot:
    | "ideeller"
    | "vermoegen"
    | "zweckbetrieb"
    | "wirtschaftlich" = "ideeller";
  if (input.kategorieId && input.kategorieId !== "") {
    const [kat] = await db
      .select()
      .from(kategorien)
      .where(eq(kategorien.id, input.kategorieId))
      .limit(1);
    if (kat) {
      kategorieNameSnapshot = kat.name;
      sphereSnapshot = kat.sphere;
    }
  }

  if (input.projectId && input.projectId !== "") {
    const [proj] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    if (proj && proj.sphereDefault) {
      sphereSnapshot = proj.sphereDefault;
    }
  }

  const businessId = await allocateBusinessId("FDW", year);

  const nettoCents = BigInt(input.nettoCents);
  const ustCents = 0n;
  const bruttoCents = nettoCents + ustCents;

  const txResult = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(invoices)
      .values({
        businessId,
        source: "app",
        rechnungsdatum: input.rechnungsdatum,
        leistungsDatum: input.leistungsDatum ?? null,
        faelligkeitsDatum: input.faelligkeitsDatum ?? null,
        customerId: input.customerId,
        customerNameSnapshot: customer.name,
        customerAddressSnapshot: customer.addressBlock ?? null,
        projectId:
          input.projectId && input.projectId !== "" ? input.projectId : null,
        nettoCents,
        ustCents,
        bruttoCents,
        currency: input.currency,
        kategorieId:
          input.kategorieId && input.kategorieId !== ""
            ? input.kategorieId
            : null,
        kategorieNameSnapshot,
        sphereSnapshot,
        bezeichnung: input.bezeichnung,
        leistungsBeschreibung: input.leistungsBeschreibung
          ? input.leistungsBeschreibung
          : null,
        pdfStatus: "queued",
        driveStatus: "pending",
        createdByUserId: actorUserId,
      })
      .returning({ id: invoices.id });

    if (!inserted) {
      throw new Error("createInvoice: invoices insert returned no row");
    }

    const idempotencyKey = `invoice:${inserted.id}:v1`;
    const [job] = await tx
      .insert(invoiceJobs)
      .values({
        invoiceId: inserted.id,
        idempotencyKey,
        status: "queued",
      })
      .returning({ id: invoiceJobs.id });

    if (!job) {
      throw new Error("createInvoice: invoice_jobs insert returned no row");
    }

    return { invoiceId: inserted.id, jobId: job.id };
  });

  await bus.emit("invoice.created", {
    invoiceId: txResult.invoiceId,
    invoiceBusinessId: businessId,
    actorUserId,
    customerId: input.customerId,
    customerNameSnapshot: customer.name,
    bruttoCents: Number(bruttoCents),
  });

  // Fire-and-forget the job. Vercel functions are short-lived so this is
  // best-effort; the job row is the source of truth and a future cron sweep
  // (Phase 7) can pick up 'queued' rows that didn't complete in time.
  void runInvoiceJob(txResult.jobId, actorUserId).catch((err) => {
    console.error(
      `[invoice.createInvoice] background job ${txResult.jobId} failed:`,
      err,
    );
  });

  return {
    ok: true,
    invoiceId: txResult.invoiceId,
    businessId,
    jobId: txResult.jobId,
  };
}

// ---------------------------------------------------------------------------
// runInvoiceJob - renders the PDF, persists bytes, uploads to Drive
// ---------------------------------------------------------------------------

export interface InvoiceJobDeps {
  renderer?: InvoicePdfRenderer;
  /** Pass `null` to skip Drive upload entirely (test mode). */
  storage?: FileStorage | null;
}

export async function runInvoiceJob(
  jobId: string,
  actorUserId: string | null,
  deps: InvoiceJobDeps = {},
): Promise<void> {
  const renderer = deps.renderer ?? pdfLibInvoiceRenderer;
  const storage: FileStorage | null =
    deps.storage === undefined ? driveFileStorage : deps.storage;

  const db = getDb();

  const claimed = await db
    .update(invoiceJobs)
    .set({
      status: "running",
      startedAt: new Date(),
      attempts: sql`${invoiceJobs.attempts} + 1`,
    })
    .where(and(eq(invoiceJobs.id, jobId), eq(invoiceJobs.status, "queued")))
    .returning({ id: invoiceJobs.id, invoiceId: invoiceJobs.invoiceId });
  if (claimed.length === 0) {
    return;
  }
  const job = claimed[0]!;

  await db
    .update(invoices)
    .set({ pdfStatus: "running" })
    .where(eq(invoices.id, job.invoiceId));

  try {
    const renderInput = await loadRenderInput(job.invoiceId);
    const { bytes, suggestedFilename } = await renderer.render(renderInput);

    await db
      .update(invoices)
      .set({
        pdfBytes: Buffer.from(bytes),
        pdfStatus: "generated",
        pdfStatusError: null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, job.invoiceId));

    let driveStatus: "uploaded" | "failed" | "pending" | "skipped" = "pending";
    let drivePdfFileId: string | null = null;
    if (storage !== null) {
      try {
        const idempotencyKey = `invoice-pdf:${job.invoiceId}`;
        const result = await storage.upload({
          buffer: bytes,
          mimeType: "application/pdf",
          name: suggestedFilename,
          idempotencyKey,
        });
        drivePdfFileId = result.id;
        driveStatus = "uploaded";
      } catch (driveErr) {
        console.error(
          `[invoice.runInvoiceJob] Drive upload failed for invoice ${job.invoiceId}:`,
          driveErr,
        );
        driveStatus = "failed";
      }
    } else {
      driveStatus = "skipped";
    }

    await db
      .update(invoices)
      .set({
        drivePdfFileId,
        driveStatus,
      })
      .where(eq(invoices.id, job.invoiceId));

    await db
      .update(invoiceJobs)
      .set({ status: "succeeded", finishedAt: new Date(), lastError: null })
      .where(eq(invoiceJobs.id, job.id));

    const [row] = await db
      .select({ businessId: invoices.businessId })
      .from(invoices)
      .where(eq(invoices.id, job.invoiceId))
      .limit(1);

    await bus.emit("invoice.pdf_generated", {
      invoiceId: job.invoiceId,
      invoiceBusinessId: row?.businessId ?? "?",
      actorUserId,
      drivePdfFileId,
      driveStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(invoices)
      .set({
        pdfStatus: "failed",
        pdfStatusError: message,
        driveStatus: "failed",
      })
      .where(eq(invoices.id, job.invoiceId));
    await db
      .update(invoiceJobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        lastError: message,
      })
      .where(eq(invoiceJobs.id, job.id));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// loadRenderInput - gather data from DB
// ---------------------------------------------------------------------------

async function loadRenderInput(invoiceId: string): Promise<InvoiceRenderInput> {
  const db = getDb();
  const [inv] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!inv) {
    throw new Error(`loadRenderInput: invoice ${invoiceId} not found`);
  }

  const settingsRows = await db.execute<{ key: string; value: unknown }>(
    sql`SELECT key, value FROM settings WHERE key IN ('verein.iban', 'verein.bic', 'verein.bank')`,
  );
  const settingsMap = new Map<string, string>();
  for (const r of settingsRows as { key: string; value: unknown }[]) {
    const v = r.value;
    if (typeof v === "string") settingsMap.set(r.key, v);
    else if (v !== null && v !== undefined) settingsMap.set(r.key, String(v));
  }

  return {
    invoiceNumber: inv.businessId,
    rechnungsdatum: inv.rechnungsdatum,
    leistungsDatum: inv.leistungsDatum ?? null,
    faelligkeitsDatum: inv.faelligkeitsDatum ?? null,
    verein: {
      name: env.VEREIN_NAME || "Folge der Wolke e.V.",
      adresse: env.VEREIN_ADRESSE || "Westermuehlstrasse 6\n80469 Muenchen",
      steuernummer: env.VEREIN_STEUERNUMMER || "",
      vereinsregister: env.VEREIN_VR || "",
      iban: settingsMap.get("verein.iban") ?? "",
      bic: settingsMap.get("verein.bic") ?? "",
      bank: settingsMap.get("verein.bank") ?? "",
    },
    customer: {
      name: inv.customerNameSnapshot,
      addressBlock: inv.customerAddressSnapshot ?? null,
    },
    bezeichnung: inv.bezeichnung,
    leistungsBeschreibung: inv.leistungsBeschreibung ?? null,
    lineItems: [
      {
        beschreibung:
          inv.leistungsBeschreibung && inv.leistungsBeschreibung.trim()
            ? inv.leistungsBeschreibung
            : inv.bezeichnung,
        nettoCents: Number(inv.nettoCents),
      },
    ],
    nettoCents: Number(inv.nettoCents),
    ustCents: Number(inv.ustCents),
    bruttoCents: Number(inv.bruttoCents),
    currency: inv.currency,
    footerNote:
      "Kein Ausweis der Umsatzsteuer gemaess Paragraph 19 UStG (Kleinunternehmerregelung). " +
      "Vielen Dank fuer die gute Zusammenarbeit.",
  };
}

// ---------------------------------------------------------------------------
// regeneratePdf
// ---------------------------------------------------------------------------

export async function regeneratePdf(
  invoiceId: string,
  actorUserId: string | null,
): Promise<RegeneratePdfResult> {
  if (!invoiceId) {
    return { ok: false, status: 400, error: "Fehlende Rechnungs-ID" };
  }
  const db = getDb();
  const [inv] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!inv) {
    return { ok: false, status: 404, error: "Rechnung nicht gefunden" };
  }
  if (inv.festgeschriebenAt) {
    return {
      ok: false,
      status: 409,
      error: "Rechnung ist festgeschrieben - bitte 'Neu generieren' nutzen",
    };
  }

  const idempotencyKey = `invoice:${invoiceId}:v${Date.now()}`;
  const [job] = await db
    .insert(invoiceJobs)
    .values({
      invoiceId,
      idempotencyKey,
      status: "queued",
    })
    .returning({ id: invoiceJobs.id });
  if (!job) {
    return {
      ok: false,
      status: 500,
      error: "Job konnte nicht erstellt werden",
    };
  }

  await db
    .update(invoices)
    .set({ pdfStatus: "queued", driveStatus: "pending" })
    .where(eq(invoices.id, invoiceId));

  void runInvoiceJob(job.id, actorUserId).catch((err) => {
    console.error(
      `[invoice.regeneratePdf] background job ${job.id} failed:`,
      err,
    );
  });

  return { ok: true, invoiceId, jobId: job.id };
}

// ---------------------------------------------------------------------------
// supersedeInvoice
// ---------------------------------------------------------------------------

export async function supersedeInvoice(
  oldInvoiceId: string,
  actorUserId: string | null,
): Promise<SupersedeInvoiceResult> {
  if (!oldInvoiceId) {
    return { ok: false, status: 400, error: "Fehlende Rechnungs-ID" };
  }
  const db = getDb();
  const [old] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, oldInvoiceId))
    .limit(1);
  if (!old) {
    return { ok: false, status: 404, error: "Rechnung nicht gefunden" };
  }

  const [existing] = await db
    .select({ id: invoices.id, businessId: invoices.businessId })
    .from(invoices)
    .where(eq(invoices.supersedesId, oldInvoiceId))
    .limit(1);
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: `Rechnung wird bereits durch ${existing.businessId} ersetzt`,
    };
  }

  const year = yearOf(old.rechnungsdatum);
  const newBusinessId = await allocateBusinessId("FDW", year);

  const txResult = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(invoices)
      .values({
        businessId: newBusinessId,
        source: "app",
        rechnungsdatum: new Date().toISOString().slice(0, 10),
        leistungsDatum: old.leistungsDatum,
        faelligkeitsDatum: old.faelligkeitsDatum,
        customerId: old.customerId,
        customerNameSnapshot: old.customerNameSnapshot,
        customerAddressSnapshot: old.customerAddressSnapshot,
        projectId: old.projectId,
        nettoCents: old.nettoCents,
        ustCents: old.ustCents,
        bruttoCents: old.bruttoCents,
        currency: old.currency,
        kategorieId: old.kategorieId,
        kategorieNameSnapshot: old.kategorieNameSnapshot,
        sphereSnapshot: old.sphereSnapshot,
        bezeichnung: old.bezeichnung,
        leistungsBeschreibung: old.leistungsBeschreibung,
        pdfStatus: "queued",
        driveStatus: "pending",
        supersedesId: old.id,
        createdByUserId: actorUserId,
      })
      .returning({ id: invoices.id });
    if (!inserted) {
      throw new Error("supersedeInvoice: invoices insert returned no row");
    }

    const idempotencyKey = `invoice:${inserted.id}:v1`;
    const [job] = await tx
      .insert(invoiceJobs)
      .values({
        invoiceId: inserted.id,
        idempotencyKey,
        status: "queued",
      })
      .returning({ id: invoiceJobs.id });
    if (!job) {
      throw new Error("supersedeInvoice: invoice_jobs insert returned no row");
    }

    return { newInvoiceId: inserted.id, jobId: job.id };
  });

  await bus.emit("invoice.superseded", {
    invoiceId: txResult.newInvoiceId,
    invoiceBusinessId: newBusinessId,
    supersedesId: old.id,
    supersedesBusinessId: old.businessId,
    actorUserId,
  });

  void runInvoiceJob(txResult.jobId, actorUserId).catch((err) => {
    console.error(
      `[invoice.supersedeInvoice] background job ${txResult.jobId} failed:`,
      err,
    );
  });

  return {
    ok: true,
    newInvoiceId: txResult.newInvoiceId,
    newBusinessId,
    jobId: txResult.jobId,
  };
}

// ---------------------------------------------------------------------------
// generatePdf alias
// ---------------------------------------------------------------------------

/** Public stable name - Phase 5 callers should use this. */
export const generatePdf = regeneratePdf;

// ---------------------------------------------------------------------------
// Live HTML preview - used by the new-invoice route
// ---------------------------------------------------------------------------

export interface PreviewInput {
  bezeichnung: string;
  leistungsBeschreibung: string | null;
  rechnungsdatum: string;
  leistungsDatum: string | null;
  faelligkeitsDatum: string | null;
  customerName: string;
  customerAddressBlock: string | null;
  nettoCents: number;
  ustCents: number;
  bruttoCents: number;
  currency: string;
  invoiceNumberPreview: string;
  verein: {
    name: string;
    adresse: string;
    steuernummer: string;
    vereinsregister: string;
  };
}

export function renderInvoicePreviewHtml(opts: PreviewInput): string {
  const eur = (c: number) =>
    (c / 100).toLocaleString("de-DE", {
      style: "currency",
      currency: opts.currency,
      minimumFractionDigits: 2,
    });
  const date = (iso: string | null) => {
    if (!iso) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
  };
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const nl = (s: string | null) =>
    s ? escape(s).replace(/\n/g, "<br />") : "";

  const verName = escape(opts.verein.name);
  const verAddr = nl(opts.verein.adresse);
  const custName = escape(opts.customerName || "(Kund:in waehlen)");
  const custAddr = nl(opts.customerAddressBlock);
  const bez = escape(opts.bezeichnung || "(Bezeichnung)");
  const beschr = opts.leistungsBeschreibung
    ? `<div style="font-size:13px;color:#374151;line-height:1.5;margin-bottom:14px;">${nl(opts.leistungsBeschreibung)}</div>`
    : '<div style="height:8px;"></div>';
  const lDatum = opts.leistungsDatum
    ? `<div style="display:flex;justify-content:space-between;padding:2px 0;"><span style="color:#6b7280;">Leistung</span><span style="font-weight:600;">${escape(date(opts.leistungsDatum))}</span></div>`
    : "";
  const fDatum = opts.faelligkeitsDatum
    ? `<div style="display:flex;justify-content:space-between;padding:2px 0;"><span style="color:#6b7280;">Faellig bis</span><span style="font-weight:600;">${escape(date(opts.faelligkeitsDatum))}</span></div>`
    : "";
  const ust =
    opts.ustCents !== 0
      ? `<tr><td style="padding:2px 18px 2px 0;color:#374151;">Umsatzsteuer</td><td style="text-align:right;">${eur(opts.ustCents)}</td></tr>`
      : "";

  return `<div class="invoice-preview" style="font-family:system-ui,-apple-system,sans-serif;color:#1f1f29;background:#fff;border:1px solid #f3d6e3;border-radius:14px;padding:24px 28px;max-width:680px;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #9c2c6e;padding-bottom:12px;margin-bottom:16px;">
    <div>
      <div style="font-size:13px;font-weight:700;letter-spacing:0.5px;color:#9c2c6e;text-transform:uppercase;">${verName}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:2px;">${verAddr}</div>
    </div>
    <div style="font-size:20px;font-weight:700;color:#9c2c6e;">Rechnung</div>
  </div>

  <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:16px;">
    <div style="flex:1;">
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:600;letter-spacing:0.4px;">Rechnung an</div>
      <div style="font-weight:700;margin-top:4px;">${custName}</div>
      <div style="font-size:12px;color:#374151;margin-top:2px;">${custAddr}</div>
    </div>
    <div style="font-size:12px;min-width:200px;">
      <div style="display:flex;justify-content:space-between;padding:2px 0;"><span style="color:#6b7280;">Rechnungs-Nr.</span><span style="font-weight:600;">${escape(opts.invoiceNumberPreview)}</span></div>
      <div style="display:flex;justify-content:space-between;padding:2px 0;"><span style="color:#6b7280;">Datum</span><span style="font-weight:600;">${escape(date(opts.rechnungsdatum))}</span></div>
      ${lDatum}
      ${fDatum}
    </div>
  </div>

  <hr style="border:none;border-top:1px solid #f3d6e3;margin:0 0 12px 0;" />

  <div style="font-size:16px;font-weight:700;color:#9c2c6e;margin-bottom:6px;">${bez}</div>
  ${beschr}

  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr><th style="text-align:left;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;border-bottom:1px solid #9c2c6e;padding:6px 0;">Beschreibung</th><th style="text-align:right;color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;border-bottom:1px solid #9c2c6e;padding:6px 0;">Netto</th></tr></thead>
    <tbody>
      <tr><td style="padding:8px 0;border-bottom:1px solid #f3d6e3;">${escape(opts.bezeichnung || "-")}</td><td style="padding:8px 0;border-bottom:1px solid #f3d6e3;text-align:right;font-weight:600;">${eur(opts.nettoCents)}</td></tr>
    </tbody>
  </table>

  <div style="margin-top:12px;display:flex;justify-content:flex-end;">
    <table style="font-size:13px;border-collapse:collapse;">
      <tbody>
        <tr><td style="padding:2px 18px 2px 0;color:#374151;">Netto</td><td style="text-align:right;font-weight:600;">${eur(opts.nettoCents)}</td></tr>
        ${ust}
        <tr><td style="padding:6px 18px 2px 0;color:#1f1f29;font-weight:700;border-top:2px solid #9c2c6e;">Gesamtbetrag</td><td style="text-align:right;font-weight:700;border-top:2px solid #9c2c6e;padding-top:6px;">${eur(opts.bruttoCents)}</td></tr>
      </tbody>
    </table>
  </div>

  <div style="margin-top:18px;font-size:12px;color:#374151;line-height:1.5;">
    Kein Ausweis der Umsatzsteuer gemaess Paragraph 19 UStG (Kleinunternehmerregelung).
  </div>

  <div style="margin-top:22px;padding-top:12px;border-top:1px solid #f3d6e3;font-size:10px;color:#6b7280;display:flex;justify-content:space-between;gap:14px;">
    <div>${verName}<br />${verAddr}</div>
    <div>Steuernummer: ${escape(opts.verein.steuernummer || "-")}<br />Register: ${escape(opts.verein.vereinsregister || "-")}</div>
  </div>
</div>`;
}

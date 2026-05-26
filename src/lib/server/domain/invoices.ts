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

import { sql, and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "$lib/server/db/index.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { invoiceJobs } from "$lib/server/db/schema/invoice_jobs.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getFileStorage, type FileStorage } from "$lib/server/files/storage.js";
import { berlinYear } from "$lib/domain/year.js";
import { bus } from "$lib/server/events/index.js";
import { env } from "$lib/server/env.js";
import { pdfLibInvoiceRenderer } from "$lib/server/pdf/pdf-lib-renderer.js";
import type {
  InvoicePdfRenderer,
  InvoiceRenderInput,
} from "$lib/server/pdf/invoice.js";
import type {
  InvoiceDriveStatus,
  InvoicePdfStatus,
  InvoiceRow,
  RechnungenStatus,
} from "$lib/domain/invoices.js";

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
    // § 14 Abs. 4 Nr. 5 UStG + BFH V R 28/15: Bezeichnung muss die Leistung
    // eindeutig identifizieren. Min 5 chars + reject generic placeholders.
    bezeichnung: z
      .string()
      .min(5, "Bezeichnung muss mindestens 5 Zeichen haben")
      .max(200, "Bezeichnung zu lang")
      .refine(
        (v) =>
          !/^(leistung|beratung|spende|dienstleistung|sonstiges|service|arbeit|honorar|rechnung)\s*$/i.test(
            v.trim(),
          ),
        "Bezeichnung zu generisch — bitte die Leistung konkret benennen (z.B. mit Datum, Veranstaltungsname)",
      ),
    leistungsBeschreibung: z
      .string()
      .max(2000, "Leistungsbeschreibung zu lang")
      .optional()
      .or(z.literal("")),
    // Leistungszeitraum is MANDATORY per § 14 Abs. 4 Nr. 6 UStG. Empty
    // string would produce a non-compliant invoice. Reject at the form/Zod
    // boundary so the renderer can rely on a non-empty value.
    leistungszeitraum: z
      .string()
      .min(3, "Leistungszeitraum ist Pflicht (§ 14 Abs. 4 Nr. 6 UStG)")
      .max(200, "Leistungszeitraum zu lang")
      .transform((v) => v.trim()),
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
  // ADR-0001: fallback to Berlin-local year (not UTC) for parse failures.
  return Number.isFinite(y) ? y : berlinYear();
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
        leistungszeitraum: input.leistungszeitraum,
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
    deps.storage === undefined ? await getFileStorage() : deps.storage;

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

    // FIXME(Phase 9 follow-up): invoice PDF upload to Blob storage.
    // The old Drive path used { name, idempotencyKey } and returned { id }.
    // The new FileStorage interface is pathname-addressed and returns { etag };
    // wiring the invoice domain to compute a deterministic pathname (e.g.
    // `rechnungen/<year>/<rechnungsnummer>.pdf`) and to persist a row in the
    // `files` table is deferred to a follow-up. For now we mark the upload
    // as skipped so the rest of the job (DB row update, status transition)
    // keeps working.
    void storage;
    void suggestedFilename;
    const driveStatus: "uploaded" | "failed" | "pending" | "skipped" =
      "skipped";
    const drivePdfFileId: string | null = null;

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

  // Fetch customer for the country code (the column was added in Phase 10).
  // Falls back to 'DE' for legacy customer rows or when the customer is
  // somehow missing (FK is restrict, but defensive code).
  const [cust] = await db
    .select({ country: customers.country })
    .from(customers)
    .where(eq(customers.id, inv.customerId))
    .limit(1);

  const settingsRows = await db.execute<{ key: string; value: unknown }>(
    sql`SELECT key, value FROM settings WHERE key IN ('verein.iban', 'verein.bic', 'verein.bank', 'verein.kassenwaert_name')`,
  );
  const settingsMap = new Map<string, string>();
  for (const r of settingsRows as { key: string; value: unknown }[]) {
    const v = r.value;
    if (typeof v === "string") settingsMap.set(r.key, v);
    else if (v !== null && v !== undefined) settingsMap.set(r.key, String(v));
  }

  // settings.value is stored as JSONB strings, e.g. '"Julia Schwarz"'.
  // Strip the wrapping quotes if present.
  const unquote = (s: string): string => s.replace(/^"|"$/g, "");
  const kassenwaertName =
    unquote(settingsMap.get("verein.kassenwaert_name") ?? "") ||
    "Julia Schwarz";

  return {
    invoiceNumber: inv.businessId,
    rechnungsdatum: inv.rechnungsdatum,
    leistungsDatum: inv.leistungsDatum ?? null,
    faelligkeitsDatum: inv.faelligkeitsDatum ?? null,
    leistungszeitraum: inv.leistungszeitraum,
    verein: {
      name: env.VEREIN_NAME || "Folge der Wolke e.V.",
      adresse: env.VEREIN_ADRESSE || "Westermuehlstrasse 6\n80469 Muenchen",
      steuernummer: env.VEREIN_STEUERNUMMER || "",
      vereinsregister: env.VEREIN_VR || "",
      iban:
        unquote(settingsMap.get("verein.iban") ?? "") || env.VEREIN_IBAN || "",
      bic: unquote(settingsMap.get("verein.bic") ?? "") || env.VEREIN_BIC || "",
      bank:
        unquote(settingsMap.get("verein.bank") ?? "") || env.VEREIN_BANK || "",
      kontaktPerson: env.VEREIN_KONTAKT_PERSON || "",
      contactPhone: env.VEREIN_CONTACT_PHONE || "",
      // Footer contact email reuses MAIL_FROM — no separate env var.
      contactEmail: env.MAIL_FROM || "",
    },
    customer: {
      name: inv.customerNameSnapshot,
      addressBlock: inv.customerAddressSnapshot ?? null,
      country: cust?.country ?? "DE",
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
    kassenwaertName,
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
        leistungszeitraum: old.leistungszeitraum,
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
// listInvoices - filtered list for the /app/rechnungen route
// ---------------------------------------------------------------------------

export interface ListInvoicesOptions {
  /**
   * Payment-state filter derived from `bezahlt_am` + `faelligkeits_datum`:
   *   - "offen"        → bezahlt_am IS NULL
   *   - "bezahlt"      → bezahlt_am IS NOT NULL
   *   - "überfällig"   → bezahlt_am IS NULL AND faelligkeits_datum < today
   *   - "alle" / omitted → no payment-state filter
   */
  status?: RechnungenStatus;
  /** Buchungsjahr (year_of_buchung). Omit to disable year filtering. */
  year?: number;
  /** "Today" override for tests — defaults to new Date(). Used to compute
   * the überfällig cut-off against `faelligkeits_datum`. */
  now?: Date;
}

/**
 * Read-only list of invoices for the admin /app/rechnungen route.
 *
 * Filters by Buchungsjahr (via the `year_of_buchung` generated column) and
 * derived payment status. Joins customers for the visible display name and
 * builds a "superseded by" lookup so rows can show "ersetzt durch FDW-...".
 */
export async function listInvoices(
  opts: ListInvoicesOptions = {},
): Promise<InvoiceRow[]> {
  const db = getDb();
  const { status, year, now = new Date() } = opts;

  const conditions = [];
  if (year !== undefined) {
    conditions.push(eq(invoices.yearOfBuchung, year));
  }
  if (status === "offen") {
    conditions.push(isNull(invoices.bezahltAm));
  } else if (status === "bezahlt") {
    conditions.push(isNotNull(invoices.bezahltAm));
  } else if (status === "überfällig") {
    const todayIso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    conditions.push(isNull(invoices.bezahltAm));
    conditions.push(lt(invoices.faelligkeitsDatum, todayIso));
  }
  // status === "alle" or undefined → no payment-state filter.

  const rows = await db
    .select({
      inv: invoices,
      customerName: customers.name,
    })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(invoices.createdAt));

  // "superseded by" lookup — second query, scoped to the IDs we just loaded
  // so we don't accidentally trim it via the filter (a row in the filter set
  // may be superseded by a row OUTSIDE the filter set).
  const ids = rows.map((r) => r.inv.id);
  const supersededByMap = new Map<string, string>();
  if (ids.length > 0) {
    const supersedesRows = await db
      .select({
        businessId: invoices.businessId,
        supersedesId: invoices.supersedesId,
      })
      .from(invoices)
      .where(isNotNull(invoices.supersedesId));
    for (const r of supersedesRows) {
      if (r.supersedesId) supersededByMap.set(r.supersedesId, r.businessId);
    }
  }

  return rows.map(({ inv, customerName }) => ({
    id: inv.id,
    businessId: inv.businessId,
    rechnungsdatum: inv.rechnungsdatum,
    customerId: inv.customerId,
    customerName: customerName ?? inv.customerNameSnapshot,
    bezeichnung: inv.bezeichnung,
    nettoCents: Number(inv.nettoCents),
    bruttoCents: Number(inv.bruttoCents),
    currency: inv.currency,
    pdfStatus: inv.pdfStatus as InvoicePdfStatus,
    driveStatus: (inv.driveStatus ?? null) as InvoiceDriveStatus,
    drivePdfFileId: inv.drivePdfFileId ?? null,
    hasPdfBytes: inv.pdfBytes !== null && inv.pdfBytes !== undefined,
    festgeschriebenAt: inv.festgeschriebenAt
      ? inv.festgeschriebenAt.toISOString()
      : null,
    supersedesId: inv.supersedesId ?? null,
    supersededByBusinessId: supersededByMap.get(inv.id) ?? null,
    createdAt: inv.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Live HTML preview - used by the new-invoice route
// ---------------------------------------------------------------------------

export interface PreviewInput {
  bezeichnung: string;
  leistungsBeschreibung: string | null;
  rechnungsdatum: string;
  leistungsDatum: string | null;
  faelligkeitsDatum: string | null;
  /** Phase 10 — free-text Leistungszeitraum row. */
  leistungszeitraum?: string | null;
  customerName: string;
  customerAddressBlock: string | null;
  /** Phase 10 — ISO 3166-1 alpha-2; preview hides Land line for 'DE'. */
  customerCountry?: string;
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
  // Phase 10: mirror the Rechnung v2 PDF layout in the live preview so admins
  // see the same colors + structure they'll get in the PDF.
  // Colors match colors.ts: #f09dff (rosa), #f5beff (soft rosa), #000028 (body).
  const eur = (c: number) =>
    (c / 100).toLocaleString("de-DE", {
      style: "currency",
      currency: opts.currency,
      minimumFractionDigits: 2,
    });
  const date = (iso: string | null) => {
    if (!iso) return "";
    const m = /^\d{4}-\d{2}-\d{2}/.test(iso);
    if (!m) return iso;
    return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
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
  const verAddrSingle = escape(
    (opts.verein.adresse ?? "")
      .split(/[\r\n]+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" - "),
  );
  const custName = escape(opts.customerName || "(Kund:in wählen)");
  const custAddr = nl(opts.customerAddressBlock);
  const bez = escape(opts.bezeichnung || "(Bezeichnung)");
  const country = (opts.customerCountry ?? "DE").toUpperCase();
  const showCountry = country && country !== "DE";
  const countryLabel = showCountry
    ? `<div style="font-size:13px;color:#000028;">${escape(country)}</div>`
    : "";

  const metaRows: string[] = [
    `<tr><td style="font-weight:700;color:#000028;padding:2px 16px 2px 0;text-align:right;">Rechnung Nr.:</td><td style="text-align:right;color:#000028;">${escape(opts.invoiceNumberPreview)}</td></tr>`,
    `<tr><td style="font-weight:700;color:#000028;padding:2px 16px 2px 0;text-align:right;">Rechnungsdatum:</td><td style="text-align:right;color:#000028;">${escape(date(opts.rechnungsdatum))}</td></tr>`,
  ];
  if (opts.leistungszeitraum && opts.leistungszeitraum.trim()) {
    metaRows.push(
      `<tr><td style="font-weight:700;color:#000028;padding:2px 16px 2px 0;text-align:right;">Leistungszeitraum:</td><td style="text-align:right;color:#000028;">${escape(opts.leistungszeitraum.trim())}</td></tr>`,
    );
  }
  const beschrRow = opts.leistungsBeschreibung
    ? `<div style="font-size:13px;font-style:italic;color:#000028;margin-top:2px;">${nl(opts.leistungsBeschreibung)}</div>`
    : "";

  return `<div class="invoice-preview" style="font-family:'DejaVu Sans',system-ui,-apple-system,sans-serif;color:#000028;background:#fff;border:1px solid #f5beff;border-radius:14px;padding:28px 32px;max-width:720px;">
  <!-- Header band -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;">
    <div>
      <div style="font-family:'Anton',Impact,sans-serif;font-size:38px;font-weight:400;line-height:1;color:#f09dff;letter-spacing:0.5px;">RECHNUNG</div>
      <div style="font-size:11px;font-weight:700;color:#000028;margin-top:6px;">${verName} - ${verAddrSingle}</div>
      <div style="font-size:10px;font-style:italic;color:#000028;margin-top:2px;">eingetragen im Vereinsregister des AG München unter ${escape(opts.verein.vereinsregister || "")}</div>
    </div>
    <!-- Logo placeholder (the PDF embeds the actual brand mark) -->
    <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#f5beff,#f09dff);opacity:0.6;"></div>
  </div>

  <!-- Address + meta block -->
  <div style="display:flex;justify-content:space-between;gap:24px;margin:24px 0 28px;">
    <div style="flex:1;font-size:13px;color:#000028;line-height:1.4;">
      <div style="font-weight:600;">${custName}</div>
      <div>${custAddr}</div>
      ${countryLabel}
    </div>
    <table style="font-size:12px;border-collapse:collapse;"><tbody>${metaRows.join("")}</tbody></table>
  </div>

  <!-- Section heading -->
  <div style="font-size:13px;font-weight:700;color:#f09dff;letter-spacing:0.5px;margin-bottom:14px;">RECHNUNG NR. ${escape(opts.invoiceNumberPreview)}</div>

  <!-- Intro -->
  <div style="font-size:13px;color:#000028;margin-bottom:6px;">Sehr geehrte Damen und Herren,</div>
  <div style="font-size:13px;color:#000028;margin-bottom:18px;">vielen Dank für Ihr Vertrauen. Ich stelle Ihnen hiermit folgende Leistungen in Rechnung:</div>

  <!-- Table -->
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="background:#f09dff;color:#fff;">
        <th style="padding:6px 8px;text-align:left;font-weight:700;width:8%;">Pos.</th>
        <th style="padding:6px 8px;text-align:left;font-weight:700;">Beschreibung</th>
        <th style="padding:6px 8px;text-align:right;font-weight:700;width:12%;">Menge</th>
        <th style="padding:6px 8px;text-align:right;font-weight:700;width:18%;">Gesamtpreis</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="padding:10px 8px;text-align:center;color:#000028;vertical-align:top;">1.</td>
        <td style="padding:10px 8px;color:#000028;">${bez}${beschrRow}</td>
        <td style="padding:10px 8px;text-align:right;color:#000028;vertical-align:top;">1</td>
        <td style="padding:10px 8px;text-align:right;color:#000028;vertical-align:top;">${eur(opts.nettoCents)}</td>
      </tr>
      <tr><td colspan="4" style="border-top:1px solid #f5beff;padding:0;height:1px;"></td></tr>
      <tr>
        <td colspan="3" style="background:#f5beff;color:#fff;font-weight:700;padding:8px;text-align:right;">Gesamtsumme</td>
        <td style="background:#f09dff;color:#fff;font-weight:700;padding:8px;text-align:right;">${eur(opts.bruttoCents)}</td>
      </tr>
    </tbody>
  </table>

  <!-- Body paragraphs -->
  <div style="font-size:13px;font-style:italic;color:#000028;margin-top:18px;">Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.</div>
  <div style="font-size:13px;color:#000028;margin-top:10px;">Zahlungsbedingungen: Zahlung innerhalb von 14 Tagen ab Rechnungseingang ohne Abzüge.</div>
  <div style="font-size:13px;color:#000028;margin-top:6px;">Bei Rückfragen stehe ich selbstverständlich jederzeit gerne zur Verfügung.</div>
  <div style="font-size:13px;color:#000028;margin-top:18px;">Mit freundlichen Grüßen</div>
</div>`;
}

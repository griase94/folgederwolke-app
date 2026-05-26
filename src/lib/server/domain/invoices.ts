/**
 * Invoices (Ausgangsrechnungen) domain layer.
 *
 * Pure-ish functions that operate on the DB. Coordinates:
 *   - Zod validation (createInvoiceSchema)
 *   - Business-ID allocation via id-allocator (FDW-{YYYY}-{NNN})
 *   - Festschreibung gate (ADR-0006)
 *   - PDF rendering via the InvoicePdfRenderer interface (pdf-lib default)
 *   - Vercel Blob persistence via the Phase 9 FileStorage / files-table pipeline
 *   - Async job state machine (invoice_jobs)
 *   - Event bus emissions (invoice.created, invoice.pdf_generated,
 *     invoice.superseded)
 *
 * The PDF generation is engine-agnostic — see §4.1.1 #4. pdf-lib builds the
 * PDF entirely from the data passed in. After render, bytes go to Vercel Blob
 * at deterministic pathname `rechnungen/<year>/<business_id>[.vN].pdf`, then
 * a `files` row with `kind='rechnung'` is created, and finally the invoice
 * row's `pdf_file_id` is set. Only after all three succeed does `pdf_status`
 * flip to 'generated'.
 *
 * Tamper-evidence: `files.sha256` is anchored into the hash-chained audit_log
 * at upload time (`invoice.pdf_generated` event handler) so any silent blob
 * mutation is detectable via the existing chain (ADR-0004).
 */

import { createHash } from "node:crypto";
import { sql, and, desc, eq, isNotNull, isNull, like, lt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "$lib/server/db/index.js";
import { invoices } from "$lib/server/db/schema/invoices.js";
import { invoiceJobs } from "$lib/server/db/schema/invoice_jobs.js";
import { customers } from "$lib/server/db/schema/customers.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { files } from "$lib/server/db/schema/files.js";
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
  /** Pass `null` to skip blob upload entirely (test mode). */
  storage?: FileStorage | null;
}

/**
 * Deterministic blob pathname for the canonical PDF.
 *
 *   v1     → `rechnungen/<year>/<businessId>.pdf`
 *   v2,v3  → `rechnungen/<year>/<businessId>.v<N>.pdf`
 *
 * Year is `year_for_booking(invoices.gebucht_am)` — i.e. the booking year, NOT
 * the upload year. The `files` Festschreibung trigger keys on `uploaded_at`
 * (see ADR-0012 caveat) — this is accepted for the Verein and documented.
 */
function buildInvoicePdfPathname(args: {
  year: number;
  businessId: string;
  version: number;
}): string {
  const suffix = args.version <= 1 ? "" : `.v${args.version}`;
  return `rechnungen/${args.year}/${args.businessId}${suffix}.pdf`;
}

/**
 * Count how many `files` rows already exist for this invoice's storage_key
 * prefix to compute the next version number. v1 is the unsuffixed pathname;
 * the v2/v3 suffixes match the prefix scan so we always pick a fresh slot.
 *
 * Counts soft-deleted rows too so the deterministic pathname never collides
 * with a tombstoned file (idx_files_storage_key is UNIQUE without a WHERE
 * predicate — see drizzle/0016_files_table.sql:50).
 */
async function nextInvoicePdfVersion(
  db: ReturnType<typeof getDb>,
  args: { year: number; businessId: string },
): Promise<number> {
  const prefix = `rechnungen/${args.year}/${args.businessId}`;
  const existing = await db
    .select({ key: files.storageKey })
    .from(files)
    .where(like(files.storageKey, `${prefix}%`));
  return existing.length + 1;
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
    const { bytes } = await renderer.render(renderInput);

    // Look up year + business_id for the deterministic pathname.
    const [meta] = await db
      .select({
        businessId: invoices.businessId,
        yearOfBuchung: invoices.yearOfBuchung,
      })
      .from(invoices)
      .where(eq(invoices.id, job.invoiceId))
      .limit(1);
    if (!meta) {
      throw new Error(`runInvoiceJob: invoice ${job.invoiceId} not found`);
    }

    const year = meta.yearOfBuchung ?? berlinYear(new Date());
    const businessId = meta.businessId;
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    let fileId: string | null = null;
    if (storage) {
      // Pre-check: if THIS invoice's latest existing version has matching
      // sha (regenerate of an unchanged invoice → deterministic renderer →
      // identical bytes), reuse it. Scoping to "latest version of THIS
      // invoice" avoids the edge case where toggling a field then toggling
      // back would silently repoint at a stale `.v2.pdf` and orphan `.v3.pdf`.
      const prefix = `rechnungen/${year}/${businessId}`;
      const existing = await db
        .select({ id: files.id, sha256: files.sha256 })
        .from(files)
        .where(
          and(like(files.storageKey, `${prefix}%`), isNull(files.deletedAt)),
        )
        .orderBy(desc(files.uploadedAt))
        .limit(1);
      if (existing[0] && existing[0].sha256 === sha256) {
        fileId = existing[0].id;
      } else {
        const version = await nextInvoicePdfVersion(db, { year, businessId });
        const pathname = buildInvoicePdfPathname({ year, businessId, version });
        const originalFilename =
          version <= 1
            ? `Rechnung_${businessId}.pdf`
            : `Rechnung_${businessId}_v${version}.pdf`;

        // Phase A — upload to blob FIRST (no DB lock held during network call).
        await storage.upload({
          buffer: bytes,
          mimeType: "application/pdf",
          pathname,
        });

        // Phase B — files INSERT. files_uploaded_by_one_of CHECK requires
        // exactly one of (user_id, submitter_email). Fall back to a system
        // marker for cron-driven retries / fire-and-forget jobs without an
        // actor session (matches plan §"Idempotency / regenerate" I5).
        const [inserted] = await db
          .insert(files)
          .values({
            storageKey: pathname,
            storageBackend: "blob",
            mimeType: "application/pdf",
            byteSize: BigInt(bytes.byteLength),
            sha256,
            originalFilename,
            kind: "rechnung",
            uploadedByUserId: actorUserId,
            uploadedBySubmitterEmail: actorUserId
              ? null
              : "system@folgederwolke.local",
            sourceKind: "app",
          })
          .returning({ id: files.id });
        if (!inserted) {
          throw new Error("runInvoiceJob: files insert returned no row");
        }
        fileId = inserted.id;
      }
    }

    // Phase C — flip pdf_status='generated' only after blob + files succeed.
    await db
      .update(invoices)
      .set({
        pdfFileId: fileId,
        pdfStatus: "generated",
        pdfStatusError: null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, job.invoiceId));

    await db
      .update(invoiceJobs)
      .set({ status: "succeeded", finishedAt: new Date(), lastError: null })
      .where(eq(invoiceJobs.id, job.id));

    // Emit AFTER the row is updated so handlers see the new pdf_file_id.
    // sha256 + storage_key are forwarded to the audit-log anchor handler.
    await bus.emit("invoice.pdf_generated", {
      invoiceId: job.invoiceId,
      invoiceBusinessId: businessId,
      actorUserId,
      fileId,
      sha256,
      byteSize: bytes.byteLength,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(invoices)
      .set({ pdfStatus: "failed", pdfStatusError: message })
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
    .set({ pdfStatus: "queued" })
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
    pdfFileId: inv.pdfFileId ?? null,
    festgeschriebenAt: inv.festgeschriebenAt
      ? inv.festgeschriebenAt.toISOString()
      : null,
    supersedesId: inv.supersedesId ?? null,
    supersededByBusinessId: supersededByMap.get(inv.id) ?? null,
    createdAt: inv.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// (Phase 11) renderInvoicePreviewHtml + PreviewInput removed — the live
// preview now renders the real PDF via /api/rechnungen/preview, so there is
// no second renderer to keep in sync.
// ---------------------------------------------------------------------------

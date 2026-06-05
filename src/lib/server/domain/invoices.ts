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
import { income } from "$lib/server/db/schema/income.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getFileStorage, type FileStorage } from "$lib/server/files/storage.js";
import { berlinYear } from "$lib/domain/year.js";
import { bus } from "$lib/server/events/index.js";
import { logAudit } from "$lib/server/audit-log/index.js";
import { env } from "$lib/server/env.js";
import { readStammdaten } from "$lib/server/domain/settings-stammdaten.js";
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

export type SupersedeInvoiceResult =
  | {
      ok: true;
      newInvoiceId: string;
      newBusinessId: string;
      jobId: string;
    }
  | { ok: false; status: number; error: string };

export type EditInvoiceResult =
  | {
      ok: true;
      jobId: string;
    }
  | CreateInvoiceFailure;

export type MarkPaidResult =
  | {
      ok: true;
      incomeId: string;
    }
  | { ok: false; status: number; error: string };

export type UndoPaymentResult =
  | { ok: true }
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
    let dedupedFromFileId: string | null = null;
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
        dedupedFromFileId = existing[0].id;
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

    // Phase C — anchor the sha256 in the hash-chained audit_log FIRST,
    // before flipping pdf_status. § 14 UStG Unversehrtheit per ADR-0012 §6
    // depends on this row landing whenever the file row landed; previously
    // the anchor went through the event bus and a handler throw would have
    // left the file persisted but unanchored. Direct write keeps the
    // invariant tight: `pdf_status='generated'` implies an audit row with
    // the file's sha256.
    if (fileId) {
      // P12-A: when sha-dedup reused an existing files row, surface that in
      // the audit payload so the Verlauf can render "PDF unverändert
      // (gleicher Inhalt wie vN)". The audit row is always written so the
      // history stays coherent across edit-then-revert flows.
      const payload: Record<string, unknown> = {
        kind: "pdf_generated",
        fileId,
        sha256,
        byteSize: bytes.byteLength,
      };
      if (dedupedFromFileId) {
        payload.dedupedFromFileId = dedupedFromFileId;
      }
      await logAudit({
        action: "update",
        entityKind: "invoice",
        entityId: job.invoiceId,
        entityBusinessId: businessId,
        actorUserId: actorUserId ?? null,
        actorKind: actorUserId ? "user" : "system",
        payload,
      });
    }

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

    // Emit for downstream consumers (currently none — the audit anchor is
    // written above, not through this event). Wrapped so a future handler
    // throw cannot retroactively flip pdf_status to 'failed' for an invoice
    // whose blob, files row, audit anchor, and status update all succeeded.
    try {
      await bus.emit("invoice.pdf_generated", {
        invoiceId: job.invoiceId,
        invoiceBusinessId: businessId,
        actorUserId,
        fileId,
        sha256,
        byteSize: bytes.byteLength,
      });
    } catch (emitErr) {
      console.error(
        "[runInvoiceJob] invoice.pdf_generated handler threw (non-fatal):",
        emitErr,
      );
    }
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

  // White-label: name + address come from the single settings→env Stammdaten
  // reader (no hardcoded FdW literals).
  const sd = await readStammdaten();

  return {
    invoiceNumber: inv.businessId,
    rechnungsdatum: inv.rechnungsdatum,
    leistungsDatum: inv.leistungsDatum ?? null,
    faelligkeitsDatum: inv.faelligkeitsDatum ?? null,
    leistungszeitraum: inv.leistungszeitraum,
    verein: {
      name: sd.name,
      adresse: sd.adresse,
      steuernummer: sd.steuernummer,
      vereinsregister: sd.vr,
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
// editInvoice — Phase 12. Update-in-place + PDF version bump + audit diff.
// ---------------------------------------------------------------------------

/**
 * Edit an existing unpaid, open-year, non-superseded invoice in place.
 *
 * Mirrors `createInvoice`:
 *   - Zod-validates via `createInvoiceSchema` (same input shape as /new)
 *   - Computes `changedFields` against the existing row (coerces bigint→number)
 *   - Single tx: UPDATE invoices + INSERT invoice_jobs + logAudit(tx)
 *   - After commit: fire-and-forget runInvoiceJob → the renderer hits the
 *     just-committed UPDATE via READ COMMITTED on the shared singleton db.
 *
 * Pre-checks (in domain): bezahltAm IS NULL, festgeschriebenAt IS NULL,
 * supersededByBusinessId IS NULL, plus the year-level Festschreibung gate.
 * Caller route should also gate the form load() so users never see the form
 * for a non-editable invoice; this is defence-in-depth.
 */
export async function editInvoice(
  invoiceId: string,
  raw: unknown,
  actorUserId: string | null,
): Promise<EditInvoiceResult> {
  if (!invoiceId) {
    return { ok: false, status: 400, error: "Fehlende Rechnungs-ID" };
  }

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

  const [old] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!old) {
    return { ok: false, status: 404, error: "Rechnung nicht gefunden" };
  }
  if (old.bezahltAm) {
    return {
      ok: false,
      status: 409,
      error: "Bereits bezahlte Rechnungen können nicht mehr bearbeitet werden",
    };
  }
  if (old.festgeschriebenAt) {
    return {
      ok: false,
      status: 409,
      error: "Diese Rechnung ist festgeschrieben (Jahr abgeschlossen)",
    };
  }
  // Check if this invoice was already superseded by another.
  const [successor] = await db
    .select({ businessId: invoices.businessId })
    .from(invoices)
    .where(eq(invoices.supersedesId, invoiceId))
    .limit(1);
  if (successor) {
    return {
      ok: false,
      status: 409,
      error: `Diese Rechnung wurde bereits durch ${successor.businessId} ersetzt`,
    };
  }

  // Year-level Festschreibung gate (re-uses createInvoice's helper). The
  // year derives from rechnungsdatum, same as createInvoice.
  const year = yearOf(input.rechnungsdatum);
  const festBis = await fetchFestgeschriebenBis();
  if (festBis !== null && year <= festBis) {
    return {
      ok: false,
      status: 409,
      error: `Jahr ${year} ist festgeschrieben - keine Bearbeitung möglich`,
    };
  }

  // Re-resolve customer / kategorie / project snapshots from current rows.
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

  const nettoCents = BigInt(input.nettoCents);
  const ustCents = 0n;
  const bruttoCents = nettoCents + ustCents;

  // Build the next row + diff. Field-by-field comparison so the audit row
  // captures only what really changed.
  type ChangedFieldEntry = {
    before: unknown;
    after: unknown;
  };
  const changedFields: Record<string, ChangedFieldEntry> = {};
  const projectIdNext =
    input.projectId && input.projectId !== "" ? input.projectId : null;
  const kategorieIdNext =
    input.kategorieId && input.kategorieId !== "" ? input.kategorieId : null;
  const leistungsDatumNext = input.leistungsDatum ?? null;
  const faelligkeitsDatumNext = input.faelligkeitsDatum ?? null;
  const leistungsBeschreibungNext = input.leistungsBeschreibung
    ? input.leistungsBeschreibung
    : null;

  const diff = (
    key: string,
    before: unknown,
    after: unknown,
    coerceBefore?: (v: unknown) => unknown,
    coerceAfter?: (v: unknown) => unknown,
  ) => {
    if (before !== after) {
      changedFields[key] = {
        before: coerceBefore ? coerceBefore(before) : before,
        after: coerceAfter ? coerceAfter(after) : after,
      };
    }
  };
  diff("customerId", old.customerId, input.customerId);
  diff("customerNameSnapshot", old.customerNameSnapshot, customer.name);
  diff(
    "customerAddressSnapshot",
    old.customerAddressSnapshot,
    customer.addressBlock ?? null,
  );
  diff("projectId", old.projectId, projectIdNext);
  diff("kategorieId", old.kategorieId, kategorieIdNext);
  diff(
    "kategorieNameSnapshot",
    old.kategorieNameSnapshot,
    kategorieNameSnapshot,
  );
  diff("sphereSnapshot", old.sphereSnapshot, sphereSnapshot);
  diff("rechnungsdatum", old.rechnungsdatum, input.rechnungsdatum);
  diff("leistungsDatum", old.leistungsDatum, leistungsDatumNext);
  diff("faelligkeitsDatum", old.faelligkeitsDatum, faelligkeitsDatumNext);
  diff("bezeichnung", old.bezeichnung, input.bezeichnung);
  diff(
    "leistungsBeschreibung",
    old.leistungsBeschreibung,
    leistungsBeschreibungNext,
  );
  diff("leistungszeitraum", old.leistungszeitraum, input.leistungszeitraum);
  // Money: bigint compares by value via !== — but coerce to number for JSON
  // (JSON.stringify on bigint throws).
  if (old.nettoCents !== nettoCents) {
    changedFields.nettoCents = {
      before: Number(old.nettoCents),
      after: Number(nettoCents),
    };
  }
  if (old.bruttoCents !== bruttoCents) {
    changedFields.bruttoCents = {
      before: Number(old.bruttoCents),
      after: Number(bruttoCents),
    };
  }
  diff("currency", old.currency, input.currency);

  const previousPdfFileId = old.pdfFileId ?? null;

  const txResult = await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        rechnungsdatum: input.rechnungsdatum,
        leistungsDatum: leistungsDatumNext,
        faelligkeitsDatum: faelligkeitsDatumNext,
        customerId: input.customerId,
        customerNameSnapshot: customer.name,
        customerAddressSnapshot: customer.addressBlock ?? null,
        projectId: projectIdNext,
        nettoCents,
        ustCents,
        bruttoCents,
        currency: input.currency,
        kategorieId: kategorieIdNext,
        kategorieNameSnapshot,
        sphereSnapshot,
        bezeichnung: input.bezeichnung,
        leistungsBeschreibung: leistungsBeschreibungNext,
        leistungszeitraum: input.leistungszeitraum,
        pdfStatus: "queued",
        pdfStatusError: null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    const idempotencyKey = `invoice:${invoiceId}:edit-${Date.now()}`;
    const [job] = await tx
      .insert(invoiceJobs)
      .values({
        invoiceId,
        idempotencyKey,
        status: "queued",
      })
      .returning({ id: invoiceJobs.id });
    if (!job) {
      throw new Error("editInvoice: invoice_jobs insert returned no row");
    }

    await logAudit(
      {
        action: "update",
        entityKind: "invoice",
        entityId: invoiceId,
        entityBusinessId: old.businessId,
        actorUserId: actorUserId ?? null,
        actorKind: actorUserId ? "user" : "system",
        payload: {
          kind: "edited",
          changedFields,
          previousPdfFileId,
        },
      },
      tx,
    );

    return { jobId: job.id };
  });

  // After commit: fire-and-forget the render. READ COMMITTED on the shared
  // singleton db means the UPDATE is visible to the worker.
  void runInvoiceJob(txResult.jobId, actorUserId).catch((err) => {
    console.error(
      `[invoice.editInvoice] background job ${txResult.jobId} failed:`,
      err,
    );
  });

  return { ok: true, jobId: txResult.jobId };
}

// ---------------------------------------------------------------------------
// markInvoiceAsPaid — Phase 12. Mark paid + auto-create matching income row.
// ---------------------------------------------------------------------------

/**
 * Mark an invoice as paid on `bezahltAm` (ISO date) and auto-create the
 * matching income row so the EÜR stays consistent. The two writes plus the
 * bidirectional audit-log breadcrumb live in one transaction.
 *
 * Pre-checks:
 *   - not paid, not festgeschrieben (on the invoice itself), not superseded
 *   - bezahltAm <= today (Berlin). No lower bound: pre-payments are legitimate.
 *   - festschreibung year gate keys on `year_for_booking(bezahltAm)` per
 *     § 11 EStG Zufluss-/Abflussprinzip — NOT on the invoice's year.
 */
export async function markInvoiceAsPaid(
  invoiceId: string,
  bezahltAm: string,
  actorUserId: string | null,
): Promise<MarkPaidResult> {
  if (!invoiceId) {
    return { ok: false, status: 400, error: "Fehlende Rechnungs-ID" };
  }
  if (!ISO_DATE.test(bezahltAm)) {
    return {
      ok: false,
      status: 400,
      error: "Zahlungsdatum im Format JJJJ-MM-TT",
    };
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
  if (inv.bezahltAm) {
    return {
      ok: false,
      status: 409,
      error: "Rechnung ist bereits als bezahlt markiert",
    };
  }
  if (inv.festgeschriebenAt) {
    return {
      ok: false,
      status: 409,
      error: "Rechnung ist festgeschrieben",
    };
  }
  const [successor] = await db
    .select({ businessId: invoices.businessId })
    .from(invoices)
    .where(eq(invoices.supersedesId, invoiceId))
    .limit(1);
  if (successor) {
    return {
      ok: false,
      status: 409,
      error: `Diese Rechnung wurde bereits durch ${successor.businessId} ersetzt`,
    };
  }

  // No future-dated payments. Berlin-local "today" so a midnight CET edge
  // case can't reject same-day clicks issued from a non-Berlin server clock.
  const todayBerlin = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (bezahltAm > todayBerlin) {
    return {
      ok: false,
      status: 400,
      error: "Zahlungsdatum darf nicht in der Zukunft liegen",
    };
  }

  // § 11 EStG Zufluss-/Abflussprinzip: the relevant Buchungsjahr for the
  // payment is the PAYMENT year (year_for_booking(bezahltAm)), not the
  // invoice's own year. Mirror the SQL helper with `berlinYear(new Date(iso))`.
  const paymentYear = berlinYear(new Date(`${bezahltAm}T12:00:00+01:00`));
  const festBis = await fetchFestgeschriebenBis();
  if (festBis !== null && paymentYear <= festBis) {
    return {
      ok: false,
      status: 409,
      error: `Zahlungsjahr ${paymentYear} ist festgeschrieben - Zahlung nicht möglich`,
    };
  }

  // Pre-allocate the income business_id BEFORE entering the tx — the
  // allocator opens its own tx and we don't want to nest the advisory lock
  // longer than necessary (matches createInvoice at invoices.ts:274).
  const incomeBusinessId = await allocateBusinessId("E", paymentYear);
  const invoiceBusinessId = inv.businessId;
  const betragCentsBig = inv.bruttoCents;
  const betragCents = Number(betragCentsBig);

  const txResult = await db.transaction(async (tx) => {
    const [incomeRow] = await tx
      .insert(income)
      .values({
        businessId: incomeBusinessId,
        source: "app",
        gebuchtAm: new Date(`${bezahltAm}T12:00:00+01:00`),
        geldEingangDatum: bezahltAm,
        rechnungsdatum: inv.rechnungsdatum,
        betragCents: betragCentsBig,
        currency: "EUR",
        bezeichnung: `Zahlung Rechnung ${invoiceBusinessId}`,
        kategorieId: inv.kategorieId ?? null,
        kategorieNameSnapshot: inv.kategorieNameSnapshot,
        sphereSnapshot: inv.sphereSnapshot,
        createdByUserId: actorUserId,
      })
      .returning({ id: income.id });
    if (!incomeRow) {
      throw new Error("markInvoiceAsPaid: income insert returned no row");
    }

    await tx
      .update(invoices)
      .set({
        bezahltAm,
        paidByIncomeId: incomeRow.id,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    await logAudit(
      {
        action: "update",
        entityKind: "invoice",
        entityId: invoiceId,
        entityBusinessId: invoiceBusinessId,
        actorUserId: actorUserId ?? null,
        actorKind: actorUserId ? "user" : "system",
        payload: {
          kind: "paid",
          bezahltAm,
          incomeId: incomeRow.id,
          incomeBusinessId,
          betragCents,
        },
      },
      tx,
    );

    // Steuerberater-friendly bidirectional breadcrumb: the income row also
    // records its origin invoice. Useful when reconciling the EÜR back to
    // the legal artifact.
    await logAudit(
      {
        action: "create",
        entityKind: "income",
        entityId: incomeRow.id,
        entityBusinessId: incomeBusinessId,
        actorUserId: actorUserId ?? null,
        actorKind: actorUserId ? "user" : "system",
        payload: {
          kind: "created_from_invoice",
          invoiceId,
          invoiceBusinessId,
        },
      },
      tx,
    );

    return { incomeId: incomeRow.id };
  });

  return { ok: true, incomeId: txResult.incomeId };
}

// ---------------------------------------------------------------------------
// undoPayment — Phase 12. Same-day-only fat-finger recovery.
// ---------------------------------------------------------------------------

/**
 * Undo a mark-paid action recorded EARLIER TODAY in Berlin local time.
 *
 * Pre-checks:
 *   - bezahltAm = today (Berlin)
 *   - paidByIncomeId IS NOT NULL
 *   - no festschreibung on either the invoice year or the payment year
 *
 * Transaction: DELETE the linked income row + nullify bezahltAm/paidByIncomeId
 * + logAudit breadcrumb. The DELETE relies on Festschreibung NOT yet being
 * applied to the payment year — same-day is the only window where this can
 * happen in practice.
 */
export async function undoPayment(
  invoiceId: string,
  actorUserId: string | null,
): Promise<UndoPaymentResult> {
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
  if (!inv.bezahltAm || !inv.paidByIncomeId) {
    return {
      ok: false,
      status: 409,
      error: "Rechnung ist nicht als bezahlt markiert",
    };
  }

  const todayBerlin = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (inv.bezahltAm !== todayBerlin) {
    return {
      ok: false,
      status: 409,
      error: "Zahlung kann nur am selben Tag zurückgenommen werden",
    };
  }

  // Festschreibung gate on BOTH years (invoice year and payment year).
  const festBis = await fetchFestgeschriebenBis();
  if (festBis !== null) {
    const invoiceYear = inv.yearOfBuchung ?? yearOf(inv.rechnungsdatum);
    const paymentYear = berlinYear(new Date(`${inv.bezahltAm}T12:00:00+01:00`));
    if (invoiceYear <= festBis || paymentYear <= festBis) {
      return {
        ok: false,
        status: 409,
        error: "Festgeschriebenes Jahr betroffen - Rücknahme nicht möglich",
      };
    }
  }

  const previousIncomeId = inv.paidByIncomeId;
  const previousBezahltAm = inv.bezahltAm;

  await db.transaction(async (tx) => {
    // Clear the invoice's payment columns FIRST so the FK from
    // invoices.paid_by_income_id → income.id (logical, no actual FK
    // constraint exists but kept clean for readers) doesn't surprise.
    await tx
      .update(invoices)
      .set({
        bezahltAm: null,
        paidByIncomeId: null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    await tx.delete(income).where(eq(income.id, previousIncomeId));

    await logAudit(
      {
        action: "update",
        entityKind: "invoice",
        entityId: invoiceId,
        entityBusinessId: inv.businessId,
        actorUserId: actorUserId ?? null,
        actorKind: actorUserId ? "user" : "system",
        payload: {
          kind: "payment_undone",
          previousIncomeId,
          previousBezahltAm,
        },
      },
      tx,
    );
  });

  return { ok: true };
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

  // The correction is dated TODAY (rechnungsdatum + gebucht_am both default to
  // now), so the new business_id must use the CURRENT Berlin year to satisfy
  // the invoices_business_id_year_ck CHECK that pins the year prefix to
  // year_of_buchung. Using `yearOf(old.rechnungsdatum)` was a Phase-5 bug that
  // would have failed the CHECK on any cross-year correction.
  const year = berlinYear();
  const newBusinessId = await allocateBusinessId("FDW", year);

  // DSGVO Art. 16 Berichtigungspflicht: when a Kunde corrects their address
  // between original issuance and supersede, the corrected address MUST flow
  // into the Storno-Neuausstellung. Re-SELECT the customer row at supersede
  // time and snapshot the FRESH name + addressBlock — not the stale snapshot
  // from the old invoice.
  const [freshCustomer] = await db
    .select({ name: customers.name, addressBlock: customers.addressBlock })
    .from(customers)
    .where(eq(customers.id, old.customerId))
    .limit(1);
  const customerNameSnapshot = freshCustomer?.name ?? old.customerNameSnapshot;
  const customerAddressSnapshot =
    freshCustomer?.addressBlock ?? old.customerAddressSnapshot;

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
        customerNameSnapshot,
        customerAddressSnapshot,
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
    bezahltAm: inv.bezahltAm ?? null,
    paidByIncomeId: inv.paidByIncomeId ?? null,
    createdAt: inv.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// (Phase 11) renderInvoicePreviewHtml + PreviewInput removed — the live
// preview now renders the real PDF via /api/rechnungen/preview, so there is
// no second renderer to keep in sync.
// ---------------------------------------------------------------------------

/**
 * /auslage-einreichen — public Auslage submission form.
 *
 * load()   → returns initial empty form state (PUBLIC_FORM_ENABLED gate).
 * actions  → parses FormData, dedups on submission_nonce (BEFORE the rate
 *            limiter, so an idempotent retry isn't charged to the abuse
 *            budget), rate-limits new requests, validates Beleg (size + MIME +
 *            magic bytes), allocates AUS-ID, uploads the Beleg, inserts the DB
 *            row (storage→DB ordering), sends EingangsMail, writes audit log,
 *            redirects.
 *
 * Idempotency scope: the submission_nonce makes SEQUENTIAL retries idempotent
 * (the early-dedup SELECT 303s to the committed row, burning no id/Blob). A
 * truly-CONCURRENT first-POST race is caught at INSERT by the partial UNIQUE
 * index — correct, but the loser has by then burned an AUS-id and uploaded an
 * orphan Blob (rare edge, accepted pre-launch; no advisory-locking).
 *
 * PUBLIC_FORM_ENABLED=false → 404 on both load and action.
 *
 * Errors → action returns `fail()` so the form can render inline messages.
 * Only the success path uses `throw redirect()`.
 */

import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { env, isPublicFormEnabled } from "$lib/server/env.js";
import {
  validateAuslageInput,
  composeBezahltVonDisplay,
} from "$lib/server/domain/auslagen.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getFileStorage, type FileStorage } from "$lib/server/files/storage.js";
import { runUploadPipeline } from "$lib/server/files/upload-pipeline.js";
import { StorageError } from "$lib/server/files/errors.js";
import { germanFileError } from "$lib/components/files/file-error-messages.js";
import { bus } from "$lib/server/events/index.js";
import { logAudit } from "$lib/server/audit-log/index.js";
import { checkAndRecord, RateLimitError } from "$lib/server/auth/rate-limit.js";
import {
  MAX_BELEG_BYTES,
  MAX_REQUEST_BYTES,
  SNIFF_PREFIX_BYTES,
  validateBelegPrefix,
  sanitizeFilename,
} from "$lib/server/domain/file-validation.js";
import { DATENSCHUTZ_VERSION } from "$lib/server/domain/datenschutz.js";

// ---------------------------------------------------------------------------
// Dependency injection seam for tests
// ---------------------------------------------------------------------------

/**
 * Test seam: replace the FileStorage implementation. When undefined the
 * production-configured backend (resolved via `getFileStorage()`) is used.
 * Tests set this to a stub to avoid hitting Drive.
 */
export let _fileStorageOverride: FileStorage | undefined = undefined;
export function _setFileStorageOverride(fs: FileStorage | undefined) {
  _fileStorageOverride = fs;
}
async function fileStorage(): Promise<FileStorage> {
  return _fileStorageOverride ?? (await getFileStorage());
}

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

/**
 * PWA share_target prefill payload — passed to the page when the user arrives
 * via a `?from=share` redirect from the share-target action handler.
 * The server only echoes the textual fields the browser supplied (title/text/
 * url); file attachments are NOT carried across the redirect (the GET URL
 * length budget can't fit a Beleg) and the user is asked to re-attach. This
 * is the M2 minimum-viable shape — full file pass-through can land later.
 */
export interface SharePrefill {
  bezeichnung?: string;
  kommentar?: string;
  fileNotice?: boolean;
}

export const load: PageServerLoad = async ({ url }) => {
  if (!env.PUBLIC_FORM_ENABLED) {
    // B-2 soft-fallback (was 404). Return 200 with formEnabled=false so the
    // page renders a "Vorübergehend nicht verfügbar" message instead of a
    // dead-end 404. Rationale: an accidental env-misconfiguration on Vercel
    // (e.g. PUBLIC_FORM_ENABLED unset after a env rotation) should not lose
    // share-target POSTs to the void or signal to outsiders that we're broken
    // — it should signal "this is temporarily off, try again or write us".
    // The POST action below still rejects with 404 so writes can't succeed.
    return {
      formEnabled: false as const,
      sharePrefill: null,
    };
  }

  // PWA share-target prefill (M2): when the browser POSTs a share to
  // /auslage-einreichen?source=share, the default action intercepts it and
  // redirects to GET /auslage-einreichen?from=share&… with the textual
  // fields in query params. Here we hydrate `sharePrefill` so the page
  // can render the form pre-populated with what the share carried.
  let sharePrefill: SharePrefill | null = null;
  if (url.searchParams.get("from") === "share") {
    sharePrefill = {
      bezeichnung: url.searchParams.get("title") ?? undefined,
      kommentar:
        url.searchParams.get("text") ??
        url.searchParams.get("url") ??
        undefined,
      fileNotice: url.searchParams.get("file") === "1",
    };
  }

  return { formEnabled: true as const, sharePrefill };
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * True if `err` is a Postgres unique-violation (SQLSTATE 23505) raised by the
 * named constraint/index. postgres-js exposes the violated constraint as
 * `err.constraint_name`; drizzle may wrap the driver error, so we walk the
 * `cause` chain defensively (same shape as audit-inbox-actions.isUniqueViolation).
 * Matching by constraint NAME — not just code — keeps the nonce idempotency
 * path from swallowing an unrelated unique-violation (e.g. business_id).
 */
function isUniqueViolationOf(err: unknown, constraintName: string): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur != null; i++) {
    if (typeof cur === "object" && cur !== null) {
      const o = cur as { code?: unknown; constraint_name?: unknown };
      if (o.code === "23505" && o.constraint_name === constraintName) {
        return true;
      }
    }
    cur =
      typeof cur === "object" && cur !== null && "cause" in cur
        ? (cur as { cause?: unknown }).cause
        : null;
  }
  return false;
}

/**
 * True iff `s` is a syntactically valid UUID. `submission_nonce` is a `uuid`
 * column, so an unvalidated client value flowing into `WHERE submission_nonce =
 * $1` (or the INSERT) raises Postgres 22P02 (invalid_text_representation) on a
 * malformed string. The early-dedup SELECT runs BEFORE the rate-limiter on an
 * unauthenticated public endpoint, so a hostile/garbled `submissionNonce` would
 * otherwise yield a 500 ahead of the abuse budget. The real form always sends
 * `crypto.randomUUID()`; we treat anything else as "no nonce" (null).
 */
function isUuid(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function ipPrefix(ip: string): string {
  if (ip.includes(":")) {
    return ip.split(":")[0] ?? ip.slice(0, 8);
  }
  const parts = ip.split(".");
  return parts.slice(0, 2).join(".");
}

/**
 * AUS-ID year in Europe/Berlin — avoids a UTC-rollover producing a 2025 ID
 * at 01:30 Berlin time on Jan 1.
 */
function berlinYear(now: Date = new Date()): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      year: "numeric",
    }).format(now),
    10,
  );
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export const actions: Actions = {
  default: async ({ request, getClientAddress, url }) => {
    // ── PWA share_target intercept (M2) — RUNS BEFORE GATE ────────────────────
    // manifest.webmanifest declares share_target POSTing multipart/form-data
    // to /auslage-einreichen?source=share with params title→bezeichnung_display,
    // text→kommentar_display, url→kommentar_url, files[0]→beleg. A normal
    // submission path would fail(400) on missing betrag/iban/consent. Instead
    // we redirect (303) to a GET that pre-populates the form with the textual
    // fields. File attachments are NOT carried across the redirect (URL length
    // budget) — the user re-attaches the Beleg on the rendered form. A note
    // banner explains this.
    //
    // Intercept MUST run BEFORE the gate check (cycle-2 pwa-mobile review):
    // when PUBLIC_FORM_ENABLED=false on Vercel, a phone-share-intent POST that
    // hit `throw error(404)` here returned a 404 error page to the user. The
    // redirect below sends them to GET /auslage-einreichen instead, where the
    // gate check renders the soft-fallback message ("Vorübergehend nicht
    // verfügbar — schreib uns: folgederwolke@gmail.com") — a real recovery
    // path instead of a dead-end.
    if (url.searchParams.get("source") === "share") {
      let title = "";
      let text = "";
      let urlField = "";
      let hadFile = false;
      try {
        const shareData = await request.formData();
        const t = shareData.get("bezeichnung_display");
        const tx = shareData.get("kommentar_display");
        const u = shareData.get("kommentar_url");
        const f = shareData.get("beleg");
        if (typeof t === "string") title = t;
        if (typeof tx === "string") text = tx;
        if (typeof u === "string") urlField = u;
        if (f instanceof File && f.size > 0) hadFile = true;
      } catch {
        // Malformed share intent → still redirect to the empty form so the
        // user sees a page they can act on instead of a 400.
      }
      const params = new URLSearchParams();
      params.set("from", "share");
      if (title) params.set("title", title.slice(0, 200));
      if (text) params.set("text", text.slice(0, 500));
      else if (urlField) params.set("text", urlField.slice(0, 500));
      if (hadFile) params.set("file", "1");
      throw redirect(303, `/auslage-einreichen?${params.toString()}`);
    }

    // ── Gate (runs AFTER share intercept so share POSTs land on GET fallback) ─
    if (!isPublicFormEnabled()) {
      throw error(404, "Das Formular ist momentan nicht verfügbar.");
    }

    const ip = getClientAddress();
    const ua = request.headers.get("user-agent") ?? "";
    const ipPrefixVal = ipPrefix(ip);

    // ── Outer body-size guard (cheap, before formData parse) ──────────────────
    // This bounds the in-memory cost of the formData parse below, which now
    // runs BEFORE the rate-limiter so an idempotent retry (known nonce) can be
    // deduped without being charged against the abuse budget.
    const contentLength = parseInt(
      request.headers.get("content-length") ?? "0",
      10,
    );
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return fail(413, {
        error: `Anfrage zu groß (max ${MAX_REQUEST_BYTES / 1024 / 1024} MiB).`,
      });
    }

    // ── 1. Parse FormData ─────────────────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return fail(400, { error: "Ungültige Anfrage: FormData defekt." });
    }

    const jsonRaw = formData.get("data");
    const belegFile = formData.get("beleg");

    // ── 1b. Early idempotency dedup BEFORE rate-limit ─────────────────────────
    // The form sends a STABLE `submissionNonce` (UUID) as a top-level field that
    // survives retries (network error, double-tap, PWA re-POST). A retry that
    // carries an already-recorded nonce is the SAME submission, not a new
    // request — so it must NOT be charged against the per-IP rate-limit budget
    // (a flaky-network user hammering retry would otherwise hit 429 instead of
    // the idempotent 303). Run the cheap nonce-presence SELECT here, ahead of
    // the limiter; on a hit, 303 to the existing row. (The JSON payload may also
    // carry the nonce; the top-level field is the robust source the form always
    // sends. The full early-dedup + INSERT-time backstop below still apply to
    // requests that reach them.)
    // UUID-validate BEFORE the SELECT: `submission_nonce` is a uuid column, so a
    // malformed value would raise 22P02 (→ 500) here on the public endpoint,
    // ahead of the rate-limiter. A non-UUID is treated as "no nonce".
    const nonceField = formData.get("submissionNonce");
    const earlyNonce = isUuid(nonceField) ? nonceField : null;
    if (earlyNonce) {
      const dedupDb = getDb();
      const existing = await dedupDb
        .select({ businessId: auslagenSubmissions.businessId })
        .from(auslagenSubmissions)
        .where(eq(auslagenSubmissions.submissionNonce, earlyNonce))
        .limit(1);
      const hit = existing[0];
      if (hit) {
        throw redirect(
          303,
          `/auslage-eingereicht?id=${encodeURIComponent(hit.businessId)}`,
        );
      }
    }

    // ── Rate limit (per-IP + global cap) ──────────────────────────────────────
    // Reached only for requests that did NOT resolve to an existing nonce above,
    // so genuine retries bypass the abuse budget while first-time/new requests
    // are still limited.
    try {
      await checkAndRecord(`auslage:submit:${ipPrefixVal}`, 5, 5 * 60 * 1000);
      await checkAndRecord("auslage:submit:global", 100, 5 * 60 * 1000);
    } catch (err) {
      if (err instanceof RateLimitError) {
        return fail(429, {
          error: "Zu viele Anfragen — bitte einen Moment warten.",
        });
      }
      throw err;
    }

    if (typeof jsonRaw !== "string") {
      return fail(400, { error: "Ungültige Anfrage: fehlendes Datenfeld." });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonRaw);
    } catch {
      return fail(400, {
        error: "Ungültige Anfrage: JSON konnte nicht geparst werden.",
      });
    }

    // Coordinate with form: it sends `submissionNonce` as a top-level
    // formData field too. Prefer the JSON-payload value but fall back to
    // the dedicated field for robustness.
    const nonceFromForm = formData.get("submissionNonce");
    if (
      typeof nonceFromForm === "string" &&
      nonceFromForm &&
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as Record<string, unknown>).submissionNonce === undefined
    ) {
      (parsed as Record<string, unknown>).submissionNonce = nonceFromForm;
    }

    // C2-TAX: a Beleg is now required for every Auslage submission (tax-
    // correctness gate — EÜR §11 EStG requires the receipt). Pre-C2-TAX
    // the action silently skipped Beleg upload when no file was attached;
    // Zod would still pass because beleg_name / beleg_mime_type were
    // optional. Both holes are closed: Zod requires the three fields,
    // and here we fail loudly with field='beleg' so the form can surface
    // the error inline.
    if (!(belegFile instanceof File) || belegFile.size === 0) {
      return fail(400, {
        error: "Beleg-Datei ist erforderlich.",
        errors: { beleg: ["Beleg-Datei ist erforderlich."] },
      });
    }
    // Pre-flight: cap file size BEFORE we read it into memory.
    if (belegFile.size > MAX_BELEG_BYTES) {
      return fail(413, {
        error: `Beleg-Datei zu groß (max ${MAX_BELEG_BYTES / 1024 / 1024} MiB).`,
      });
    }
    (parsed as Record<string, unknown>).beleg_name = belegFile.name;
    (parsed as Record<string, unknown>).beleg_mime_type = belegFile.type;

    // ── 2. Server-side validation ─────────────────────────────────────────────
    const validation = validateAuslageInput(parsed);
    if (!validation.ok) {
      return fail(422, {
        error: "Bitte korrigiere die markierten Felder.",
        errors: validation.errors,
      });
    }

    const input = validation.data;
    const bv = input.bezahlt_von;

    // ── 2b. DSGVO consent version match ───────────────────────────────────────
    if (input.consent_text_version !== DATENSCHUTZ_VERSION) {
      return fail(422, {
        error:
          "Die Datenschutzversion hat sich geändert. Bitte lade die Seite neu und stimme erneut zu.",
        errors: { consent_text_version: ["Veraltete Datenschutzversion."] },
      });
    }

    // ── 2b-idem. Secondary nonce dedup (JSON-payload nonce) ───────────────────
    // Step 1b already deduped on the top-level `submissionNonce` form field
    // BEFORE the rate-limiter (the path the form reliably uses). This second
    // check covers the case where the nonce arrived ONLY inside the JSON `data`
    // payload (e.g. a future/programmatic client). On a hit, resolve to the
    // existing row and 303 — still BEFORE allocateBusinessId + runUploadPipeline,
    // so a SEQUENTIAL retry burns no AUS-id and uploads no Blob.
    //
    // IDEMPOTENCY SCOPE (honest): this early dedup only fires once the FIRST
    // submission for the nonce has COMMITTED — i.e. it covers SEQUENTIAL retries
    // (network error, double-tap, PWA re-POST). For two TRULY-concurrent
    // first-time POSTs that both miss this SELECT, the INSERT-time partial
    // UNIQUE index (WHERE submission_nonce IS NOT NULL, migration 0033) is the
    // backstop: the loser is caught at step 5 and redirected to the winner — but
    // by then it has ALREADY allocated an AUS-id and uploaded a Blob/files row,
    // which are orphaned (a burned gapless id + a Blob the manual files-reconcile
    // sweep collects). That concurrent race is a rare edge accepted pre-launch
    // (small-Verein calibration); we do NOT add nonce advisory-locking.
    // UUID-validate the JSON-payload nonce too (it flows into the SELECT below
    // AND the INSERT's uuid column); fall back to the already-validated
    // earlyNonce. A non-UUID from either source collapses to null ("no nonce").
    const submissionNonce =
      (isUuid(input.submissionNonce) ? input.submissionNonce : null) ??
      earlyNonce;
    if (submissionNonce) {
      const dedupDb = getDb();
      const existing = await dedupDb
        .select({ businessId: auslagenSubmissions.businessId })
        .from(auslagenSubmissions)
        .where(eq(auslagenSubmissions.submissionNonce, submissionNonce))
        .limit(1);
      const hit = existing[0];
      if (hit) {
        throw redirect(
          303,
          `/auslage-eingereicht?id=${encodeURIComponent(hit.businessId)}`,
        );
      }
    }

    // ── 2c. Beleg magic-byte sniff ────────────────────────────────────────────
    // Two-phase: (1) sniff only a small prefix to reject hostile files cheaply,
    // (2) buffer the full body only after the prefix passes validation.
    let belegBytes: Buffer | null = null;
    let belegSniffedMime: string | null = null;
    let belegFilenameSafe = "beleg";
    if (belegFile instanceof File && belegFile.size > 0) {
      const declared =
        input.beleg_mime_type || belegFile.type || "application/octet-stream";

      // Phase 1: prefix sniff (≤ SNIFF_PREFIX_BYTES bytes in memory).
      let prefix: Uint8Array;
      try {
        prefix = new Uint8Array(
          await belegFile.slice(0, SNIFF_PREFIX_BYTES).arrayBuffer(),
        );
      } catch {
        return fail(400, { error: "Beleg konnte nicht gelesen werden." });
      }
      const prefixCheck = validateBelegPrefix(prefix, declared);
      if (!prefixCheck.valid) {
        return fail(415, {
          error: prefixCheck.reason,
          errors: { beleg: [prefixCheck.reason] },
        });
      }
      belegSniffedMime = prefixCheck.sniffedMime;

      // Phase 2: buffer the full body for upload (size already capped).
      try {
        belegBytes = Buffer.from(await belegFile.arrayBuffer());
      } catch {
        return fail(400, { error: "Beleg konnte nicht gelesen werden." });
      }
      belegFilenameSafe = sanitizeFilename(belegFile.name || "beleg");
    }

    // ── 3. Allocate business ID (Berlin TZ) ───────────────────────────────────
    const year = berlinYear();
    const ausId = await allocateBusinessId("AUS", year);

    // ── 4. Upload pipeline (BEFORE DB insert — storage→DB ordering) ──────────
    // Blob upload happens FIRST, then a short DB tx registers the `files` row
    // and writes the audit-log entry on the same connection. Concurrent
    // identical uploads (same sha256) are handled by the pipeline's
    // unique_violation retry path — see src/lib/server/files/upload-pipeline.ts.
    //
    // `belegFileId` is the FK into the new normalized `files` table; the
    // legacy `belegDriveFileId` column stays NULL on new submissions and is
    // dropped in Phase 9 Task 17.
    let belegFileId: string | null = null;
    if (belegBytes && belegSniffedMime) {
      const submitterEmailForUpload =
        bv.kind === "extern"
          ? bv.email
          : bv.kind === "member"
            ? (bv.email ?? null)
            : null;
      try {
        const uploadResult = await runUploadPipeline({
          bytes: new Uint8Array(belegBytes),
          claimedMime: belegSniffedMime,
          originalFilename: belegFilenameSafe,
          // C2-TAX: identity routed per the generalized signature. The
          // public form is form-mode (no logged-in user), so user_id is
          // null and source_kind='form'.
          submitterEmail: submitterEmailForUpload ?? "anonymous@unknown",
          actorUserId: null,
          sourceKind: "form",
          storage: await fileStorage(),
        });
        belegFileId = uploadResult.fileId;
      } catch (uploadErr) {
        if (uploadErr instanceof StorageError) {
          console.warn(
            `[auslage-einreichen] upload failed (${uploadErr.code}):`,
            uploadErr.message,
          );
          const status =
            uploadErr.code === "STORAGE_INVALID" ||
            uploadErr.code === "STORAGE_DUPLICATE"
              ? 422
              : 502;
          return fail(status, {
            error: germanFileError(uploadErr.code),
            errors: { beleg: [germanFileError(uploadErr.code)] },
          });
        }
        console.error(
          `[auslage-einreichen] unexpected upload error:`,
          uploadErr,
        );
        return fail(500, {
          error: germanFileError("UNKNOWN"),
        });
      }
    }

    // ── 5. Insert DB row ──────────────────────────────────────────────────────
    const db = getDb();
    let submissionId: string;
    try {
      submissionId = await db.transaction(async (tx) => {
        const [insertedRow] = await tx
          .insert(auslagenSubmissions)
          .values({
            businessId: ausId,
            submissionNonce,
            bezeichnung: input.bezeichnung,
            kommentar: input.kommentar ?? null,
            rechnungsdatum: input.rechnungsdatum ?? null,
            betragCents: BigInt(input.betragCents),
            currency: input.currency,
            wofuer: input.wofuer ?? null,
            bezahltVonKind: bv.kind,
            bezahltVonMemberId: bv.kind === "member" ? bv.member_id : null,
            externName: bv.kind === "extern" ? bv.name : null,
            externIban: bv.kind === "extern" ? bv.iban : null,
            externEmail: bv.kind === "extern" ? bv.email : null,
            bezahltVonDisplay: composeBezahltVonDisplay(bv),
            belegDriveFileId: null,
            belegFileId,
            belegOriginalName:
              belegFile instanceof File ? belegFile.name : null,
            submitterIpPrefix: ipPrefixVal,
            submitterUaHash: hashString(ua),
            consentTextVersion: input.consent_text_version,
          })
          .returning({ id: auslagenSubmissions.id });

        if (!insertedRow) throw new Error("INSERT returned no row");

        // ── Legal create-anchor (ADR-0004), written IN-TX ─────────────────────
        // The audit row is written on the SAME transaction as the submission
        // INSERT (logAudit's tx-writer seam). If logAudit throws, the WHOLE tx
        // (INSERT + audit) rolls back, so the submission_nonce is never
        // committed — the user's retry re-inserts and re-audits cleanly. Before
        // this, the audit ran post-commit on the bus, so a transient audit
        // failure left a committed-but-unaudited row that the nonce early-dedup
        // would then 303 straight to "success" on retry — a silent ADR-0004 gap.
        // Mirrors the invoice.pdf_generated direct-anchor precedent; the bus
        // audit handler (handlers.ts) is idempotent and no-ops on the post-
        // commit emit below.
        await logAudit(
          {
            action: "create",
            entityKind: "auslagen_submission",
            entityId: insertedRow.id,
            entityBusinessId: ausId,
            actorKind: "system",
            actorIpPrefix: ipPrefixVal,
            actorUaHash: hashString(ua),
            payload: {
              bezeichnung: input.bezeichnung,
              betragCents: input.betragCents,
              bezahltVonKind: bv.kind,
              consentTextVersion: input.consent_text_version,
            },
          },
          tx,
        );

        return insertedRow.id;
      });
    } catch (dbErr) {
      // ── Concurrency backstop: nonce unique-violation → idempotent redirect ──
      // Two near-simultaneous first-time POSTs with the SAME nonce can both
      // miss the early-dedup SELECT and reach this INSERT; the loser trips the
      // partial UNIQUE index `auslagen_submissions_submission_nonce_uq`
      // (migration 0033). Disambiguate by CONSTRAINT NAME: only the nonce
      // index resolves to the existing row's success redirect. A business_id
      // 23505 (or any other failure) stays a real 500 — the AUS-id collision
      // is a genuine allocator bug, never a user-visible "success".
      if (
        submissionNonce &&
        isUniqueViolationOf(dbErr, "auslagen_submissions_submission_nonce_uq")
      ) {
        const dedupDb = getDb();
        const existing = await dedupDb
          .select({ businessId: auslagenSubmissions.businessId })
          .from(auslagenSubmissions)
          .where(eq(auslagenSubmissions.submissionNonce, submissionNonce))
          .limit(1);
        const hit = existing[0];
        if (hit) {
          throw redirect(
            303,
            `/auslage-eingereicht?id=${encodeURIComponent(hit.businessId)}`,
          );
        }
      }
      console.error(
        `[auslage-einreichen] DB insert failed for ${ausId}:`,
        dbErr,
      );
      // Blob + files row are already written but no owner FK references them.
      // Reconciliation is the run-by-hand `scripts/files-reconcile.ts` sweep
      // (no nightly cron exists yet) — pre-launch this orphan is litter, not
      // corruption. The user's retry dedups on the nonce (or business_id) and
      // won't duplicate the submission.
      return fail(500, {
        error: "Fehler beim Speichern der Einreichung. Bitte erneut versuchen.",
      });
    }

    // ── 6. Emit domain event (best-effort EingangsMail) ──────────────────────
    // §4.1.1 #2: route actions must not call sendMail() directly — emit and let
    // the registered mail handler dispatch the EingangsMail (best-effort). The
    // CRITICAL audit anchor is NO LONGER carried by this emit: it was written
    // atomically inside the step-5 transaction (ADR-0004), and the bus audit
    // handler is idempotent (no-ops because the row already exists). This emit
    // therefore only drives the best-effort mail.
    const recipientEmail =
      bv.kind === "extern"
        ? bv.email
        : bv.kind === "member"
          ? (bv.email ?? null)
          : null;
    const vorname =
      bv.kind === "member"
        ? (bv.display_name.split(" ")[0] ?? bv.display_name)
        : bv.kind === "extern"
          ? (bv.name.split(" ")[0] ?? bv.name)
          : "Mitglied";

    try {
      await bus.emit("auslagen.submitted", {
        submissionId,
        ausId,
        email: recipientEmail,
        vorname,
        bezeichnung: input.bezeichnung,
        betragCents: input.betragCents,
        // Phase 9: this field still ships under its legacy name on the bus
        // contract; the value is now the `files.id` UUID (not a Drive id).
        // The bus payload key gets renamed in Task 17.
        driveFileId: belegFileId,
        consentTextVersion: input.consent_text_version,
        ipPrefix: ipPrefixVal,
        userAgentHash: hashString(ua),
        bezahltVonKind: bv.kind,
      });
    } catch (busErr) {
      // The submission AND its audit anchor are already committed (step 5). The
      // mail handler swallows its own errors, so anything reaching here is a
      // non-critical post-commit hiccup — it must NOT turn a fully-recorded
      // submission into a user-visible 500 (which would prompt a needless retry
      // that just dedups on the nonce). Log and proceed to the success redirect.
      console.error(
        `[auslage-einreichen] post-commit emit failure for ${ausId}:`,
        busErr,
      );
    }

    // ── 7. Redirect ───────────────────────────────────────────────────────────
    throw redirect(303, `/auslage-eingereicht?id=${encodeURIComponent(ausId)}`);
  },
};

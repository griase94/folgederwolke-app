/**
 * /auslage-einreichen — public Auslage submission form.
 *
 * load()   → returns initial empty form state (PUBLIC_FORM_ENABLED gate).
 * actions  → validates, rate-limits, validates Beleg (size + MIME + magic
 *            bytes), allocates AUS-ID, uploads to Drive, inserts DB row
 *            (Drive→DB ordering with best-effort cleanup on DB failure),
 *            sends EingangsMail, writes audit log, redirects.
 *
 * PUBLIC_FORM_ENABLED=false → 404 on both load and action.
 *
 * Errors → action returns `fail()` so the form can render inline messages.
 * Only the success path uses `throw redirect()`.
 */

import { error, fail, redirect } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
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
import { bus } from "$lib/server/events/index.js";
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
    throw error(404, "Das Formular ist momentan nicht verfügbar.");
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

  return { formEnabled: true, sharePrefill };
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

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
    // ── Gate ──────────────────────────────────────────────────────────────────
    if (!isPublicFormEnabled()) {
      throw error(404, "Das Formular ist momentan nicht verfügbar.");
    }

    // ── PWA share_target intercept (M2) ───────────────────────────────────────
    // manifest.webmanifest declares share_target POSTing multipart/form-data
    // to /auslage-einreichen?source=share with params title→bezeichnung_display,
    // text→kommentar_display, url→kommentar_url, files[0]→beleg. A normal
    // submission path would fail(400) on missing betrag/iban/consent. Instead
    // we redirect (303) to a GET that pre-populates the form with the textual
    // fields. File attachments are NOT carried across the redirect (URL length
    // budget) — the user re-attaches the Beleg on the rendered form. A note
    // banner explains this.
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

    const ip = getClientAddress();
    const ua = request.headers.get("user-agent") ?? "";
    const ipPrefixVal = ipPrefix(ip);

    // ── Outer body-size guard (cheap, before formData parse) ──────────────────
    const contentLength = parseInt(
      request.headers.get("content-length") ?? "0",
      10,
    );
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return fail(413, {
        error: `Anfrage zu groß (max ${MAX_REQUEST_BYTES / 1024 / 1024} MiB).`,
      });
    }

    // ── Rate limit (per-IP + global cap) ──────────────────────────────────────
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

    // ── 1. Parse FormData ─────────────────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return fail(400, { error: "Ungültige Anfrage: FormData defekt." });
    }

    const jsonRaw = formData.get("data");
    const belegFile = formData.get("beleg");

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

    if (belegFile instanceof File && belegFile.size > 0) {
      // Pre-flight: cap file size BEFORE we read it into memory.
      if (belegFile.size > MAX_BELEG_BYTES) {
        return fail(413, {
          error: `Beleg-Datei zu groß (max ${MAX_BELEG_BYTES / 1024 / 1024} MiB).`,
        });
      }
      (parsed as Record<string, unknown>).beleg_name = belegFile.name;
      (parsed as Record<string, unknown>).beleg_mime_type = belegFile.type;
    }

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

    // ── 4. Drive upload (BEFORE DB insert — Drive→DB ordering) ────────────────
    // Use the client-supplied submissionNonce as idempotency key so retries
    // de-dup at the Drive level. Generate a fallback if missing.
    const submissionNonce = input.submissionNonce ?? randomUUID();
    const idempotencyKey = `${ausId}:${submissionNonce}`;

    let driveFileId: string | null = null;
    if (belegBytes && belegSniffedMime) {
      try {
        const result = await (
          await fileStorage()
        ).upload({
          buffer: new Uint8Array(belegBytes),
          mimeType: belegSniffedMime,
          name: `${ausId}_${belegFilenameSafe}`,
          idempotencyKey,
        });
        driveFileId = result.id;
      } catch (driveErr) {
        console.error(
          `[auslage-einreichen] Drive upload failed for ${ausId}:`,
          driveErr,
        );
        return fail(502, {
          error: "Beleg-Upload fehlgeschlagen. Bitte erneut versuchen.",
        });
      }
    }

    // ── 5. Insert DB row ──────────────────────────────────────────────────────
    const db = getDb();
    let submissionId: string;
    try {
      const [insertedRow] = await db
        .insert(auslagenSubmissions)
        .values({
          businessId: ausId,
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
          belegDriveFileId: driveFileId,
          belegOriginalName: belegFile instanceof File ? belegFile.name : null,
          submitterIpPrefix: ipPrefixVal,
          submitterUaHash: hashString(ua),
          consentTextVersion: input.consent_text_version,
        })
        .returning({ id: auslagenSubmissions.id });

      if (!insertedRow) throw new Error("INSERT returned no row");
      submissionId = insertedRow.id;
    } catch (dbErr) {
      console.error(
        `[auslage-einreichen] DB insert failed for ${ausId}:`,
        dbErr,
      );
      // Roll back the orphan uploaded file (best effort).
      if (driveFileId) {
        try {
          const storage = await fileStorage();
          await storage.delete(driveFileId);
        } catch (rollbackErr) {
          console.warn(
            `[auslage-einreichen] rollback delete failed for ${driveFileId}:`,
            rollbackErr,
          );
        }
      }
      return fail(500, {
        error: "Fehler beim Speichern der Einreichung. Bitte erneut versuchen.",
      });
    }

    // ── 6. Emit domain event (mail + audit log handled by bus) ────────────────
    // §4.1.1 #2: route actions must not call sendMail()/auditLog() directly.
    // Registered handlers (src/lib/server/events/handlers.ts) run the
    // EingangsMail dispatch (best-effort) and the audit log insert (critical).
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
        driveFileId,
        consentTextVersion: input.consent_text_version,
        ipPrefix: ipPrefixVal,
        userAgentHash: hashString(ua),
        bezahltVonKind: bv.kind,
      });
    } catch (busErr) {
      // The mail handler swallows its own errors, so any error reaching here
      // came from the audit-log handler — which is the exact tamper window
      // ADR-0004 closes. Surface it to the caller; their idempotent retry
      // (business_id uniqueness) will not duplicate the row. The 2026-05-19
      // security review (HIGH-1) flagged the previous swallow-and-continue.
      console.error(
        `[auslage-einreichen] audit handler failure for ${ausId}:`,
        busErr,
      );
      return fail(500, {
        error:
          "Deine Einreichung wurde zwischengespeichert, aber die Buchhaltung konnte sie nicht endgültig protokollieren. Bitte versuche es in einer Minute noch einmal — Doppeleinreichungen werden automatisch erkannt.",
      });
    }

    // ── 7. Redirect ───────────────────────────────────────────────────────────
    throw redirect(303, `/auslage-eingereicht?id=${encodeURIComponent(ausId)}`);
  },
};

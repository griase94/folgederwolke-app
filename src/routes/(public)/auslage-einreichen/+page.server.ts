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
import { inArray } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { env, isPublicFormEnabled } from "$lib/server/env.js";
import { validateAuslageBatchInput } from "$lib/server/domain/auslagen.js";
import {
  submitAuslagenBatch,
  MAX_BATCH_ITEMS,
  type AuslageBatchItem,
} from "$lib/server/domain/auslage-submit.js";
import { getFileStorage, type FileStorage } from "$lib/server/files/storage.js";
import { intakeBeleg } from "$lib/server/domain/auslage-beleg-upload.js";
import { checkAndRecord, RateLimitError } from "$lib/server/auth/rate-limit.js";
import { MAX_REQUEST_BYTES } from "$lib/server/domain/file-validation.js";
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
      maxBatchItems: MAX_BATCH_ITEMS,
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

  return {
    formEnabled: true as const,
    sharePrefill,
    maxBatchItems: MAX_BATCH_ITEMS,
  };
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * True iff `s` is a syntactically valid UUID. `submission_nonce` is a `uuid`
 * column, so a malformed value flowing into `WHERE submission_nonce = $1` raises
 * Postgres 22P02. The early-dedup SELECT runs BEFORE the rate-limiter on an
 * unauthenticated public endpoint, so a garbled nonce would otherwise 500 ahead
 * of the abuse budget. The real form always sends `crypto.randomUUID()`; we
 * treat anything else as "no nonce" (null), so it can never dedup.
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
    // Bounds the in-memory cost of the multipart parse below (n Belege). The
    // parse runs BEFORE the rate-limiter so a full idempotent retry (all nonces
    // known) can 303 without being charged against the abuse budget.
    const contentLength = parseInt(
      request.headers.get("content-length") ?? "0",
      10,
    );
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return fail(413, {
        error: `Anfrage zu groß (max ${MAX_REQUEST_BYTES / 1024 / 1024} MiB).`,
      });
    }

    // ── 1. Parse multipart FormData ───────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return fail(400, { error: "Ungültige Anfrage: FormData defekt." });
    }

    const jsonRaw = formData.get("data");
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

    // ── 1b. Early idempotency dedup BEFORE rate-limit ─────────────────────────
    // Collect every item's UUID nonce. If ALL of them are already committed the
    // whole batch is a retry (network error / double-tap / PWA re-POST): 303 to
    // the existing group's first AUS-Nr WITHOUT charging the rate limit and
    // WITHOUT re-uploading any Beleg (which would orphan blobs). A partial retry
    // (some nonces new) falls through — submitAuslagenBatch inserts only the
    // missing items into the EXISTING group (retry heals the batch, never splits
    // it). Non-UUID / missing nonces never dedup (treated as "no nonce").
    const itemNonces: string[] =
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as { auslagen?: unknown }).auslagen)
        ? ((parsed as { auslagen: unknown[] }).auslagen
            .map((it) =>
              it && typeof it === "object"
                ? (it as { submission_nonce?: unknown }).submission_nonce
                : undefined,
            )
            .filter(isUuid) as string[])
        : [];

    if (itemNonces.length > 0) {
      const dedupDb = getDb();
      const existing = await dedupDb
        .select({
          businessId: auslagenSubmissions.businessId,
          submissionNonce: auslagenSubmissions.submissionNonce,
        })
        .from(auslagenSubmissions)
        .where(inArray(auslagenSubmissions.submissionNonce, itemNonces));
      const knownNonces = new Set(existing.map((r) => r.submissionNonce));
      const allKnown = itemNonces.every((n) => knownNonces.has(n));
      if (allKnown && existing.length > 0) {
        // Resolve to the lowest business_id of the group so the confirmation
        // opens on the batch's first AUS-Nr (deterministic).
        const first = existing
          .map((r) => r.businessId)
          .sort((a, b) => a.localeCompare(b))[0]!;
        throw redirect(
          303,
          `/auslage-eingereicht?id=${encodeURIComponent(first)}`,
        );
      }
    }

    // ── 2. Rate limit (per-IP + global) — 1 batch = 1 charge ──────────────────
    // Reached only for non-retry requests (see early dedup above), so genuine
    // retries never hit 429.
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

    // ── 3. Validate the batch (extern-only identity + N items) ────────────────
    const validation = validateAuslageBatchInput(parsed);
    if (!validation.ok) {
      return fail(422, {
        error: "Bitte korrigiere die markierten Felder.",
        formErrors: validation.formErrors,
        identityErrors: validation.identityErrors,
        itemErrors: validation.itemErrors,
      });
    }
    const input = validation.data;

    // ── 3b. DSGVO consent version match ───────────────────────────────────────
    if (input.consent_text_version !== DATENSCHUTZ_VERSION) {
      return fail(422, {
        error:
          "Die Datenschutzversion hat sich geändert. Bitte lade die Seite neu und stimme erneut zu.",
        formErrors: ["Veraltete Datenschutzversion."],
        identityErrors: {},
        itemErrors: {},
      });
    }

    // ── 4. Per-item Beleg pipeline (sniff → upload) BEFORE the DB tx ───────────
    // Storage→DB ordering: every Beleg is validated + uploaded first, then the
    // whole batch inserts in ONE transaction inside submitAuslagenBatch. A Beleg
    // uploaded for an item that later dedups is orphan litter for
    // scripts/files-reconcile.ts (accepted pre-launch, flow-brief risk 5). Each
    // item's Beleg arrives as `beleg_<i>` (index = position in the auslagen array).
    const storage = await fileStorage();
    const items: AuslageBatchItem[] = [];
    for (let i = 0; i < input.auslagen.length; i++) {
      const item = input.auslagen[i]!;
      const file = formData.get(`beleg_${i}`);

      // C2-TAX: the public flow always requires a Beleg (no Verzicht arm).
      if (!(file instanceof File) || file.size === 0) {
        return fail(422, {
          error: "Bitte korrigiere die markierten Felder.",
          formErrors: [],
          identityErrors: {},
          itemErrors: {
            [item.client_key]: { beleg: ["Beleg-Datei ist erforderlich."] },
          },
        });
      }
      // Size cap, magic-byte sniff and upload are shared with the member
      // portal — see domain/auslage-beleg-upload.ts. Only the error SHAPE is
      // route-specific.
      const intake = await intakeBeleg({
        file,
        submitterEmail: input.identity.email,
        actorUserId: null,
        storage,
      });
      if (!intake.ok) {
        return fail(intake.status, {
          error: intake.message,
          formErrors: [],
          identityErrors: {},
          itemErrors: { [item.client_key]: { beleg: [intake.message] } },
        });
      }

      items.push({
        submissionNonce: item.submission_nonce ?? null,
        bezeichnung: item.bezeichnung,
        kommentar: item.kommentar ?? null,
        rechnungsdatum: item.rechnungsdatum,
        betragCents: item.betrag_cents,
        wofuer: item.wofuer ?? null,
        belegFileId: intake.belegFileId,
        belegOriginalName: intake.originalName,
      });
    }

    // ── 5. Persist the batch (ONE tx: N inserts + N in-tx audit anchors) ──────
    let result: Awaited<ReturnType<typeof submitAuslagenBatch>>;
    try {
      result = await submitAuslagenBatch({
        bezahltVon: {
          kind: "extern",
          name: input.identity.name,
          iban: input.identity.iban,
          email: input.identity.email,
        },
        items,
        consentTextVersion: input.consent_text_version,
        submitterIpPrefix: ipPrefixVal,
        submitterUaHash: hashString(ua),
        notifyEmail: input.identity.email,
        notifyVorname: input.identity.name.split(" ")[0] ?? input.identity.name,
      });
    } catch (dbErr) {
      console.error(`[auslage-einreichen] batch submit failed:`, dbErr);
      // Uploaded blobs are orphan litter for files-reconcile (pre-launch). The
      // user's retry dedups on the nonces and won't duplicate the submission.
      return fail(500, {
        error: "Fehler beim Speichern der Einreichung. Bitte erneut versuchen.",
      });
    }

    // ── 6. Redirect to the confirmation on the batch's first AUS-Nr ───────────
    const firstAus = result.submissions[0]?.businessId;
    if (!firstAus) {
      return fail(500, {
        error: "Fehler beim Speichern der Einreichung. Bitte erneut versuchen.",
      });
    }
    throw redirect(
      303,
      `/auslage-eingereicht?id=${encodeURIComponent(firstAus)}`,
    );
  },
};

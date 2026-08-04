/**
 * /portal/auslagen/neu — the member Auslage submit surface (Aurora A-flow S2b).
 *
 * The same batch pipeline as the public form, with four differences that all
 * follow from "we know who this is":
 *   1. Identity comes from the SESSION. A payload may not name its own
 *      submitter (§7-2) — the schema has no identity field at all.
 *   2. Consent is not asked again; membership carries it. The server stamps the
 *      current DATENSCHUTZ_VERSION.
 *   3. A documented Beleg-Verzicht is allowed (the Vorstand reviews it); the
 *      public arm still requires a file.
 *   4. The payout IBAN follows the A/B/C matrix and may — on request — also
 *      update the member's profile, inside the SAME transaction as the batch,
 *      so "im Profil gespeichert" can never be true for a failed submit.
 *
 * F3: `normalizeIban` + `validateIban` run HERE, before `submitAuslagenBatch`
 * (whose contract delegates that duty to the caller).
 *
 * PRIVACY: the stored IBAN is never sent to the client — the form receives only
 * the masked form from the portal layout, and Fall A submits no IBAN at all.
 */

import { fail, redirect } from "@sveltejs/kit";
import { and, inArray, eq, isNull } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { auslagenSubmissions } from "$lib/server/db/schema/auslagen_submissions.js";
import { members } from "$lib/server/db/schema/members.js";
import { projects } from "$lib/server/db/schema/projects.js";
import {
  validateMemberAuslageBatchInput,
  IBAN_ERROR_MESSAGE,
} from "$lib/server/domain/auslagen.js";
import {
  submitAuslagenBatch,
  MAX_BATCH_ITEMS,
  NonceConflictError,
  type AuslageBatchItem,
} from "$lib/server/domain/auslage-submit.js";
import { intakeBeleg } from "$lib/server/domain/auslage-beleg-upload.js";
import { getFileStorage, type FileStorage } from "$lib/server/files/storage.js";
import { checkAndRecord, RateLimitError } from "$lib/server/auth/rate-limit.js";
import { MAX_REQUEST_BYTES } from "$lib/server/domain/file-validation.js";
import { DATENSCHUTZ_VERSION } from "$lib/server/domain/datenschutz.js";
import { validateIban, normalizeIban } from "$lib/domain/iban.js";

/** Test seam — mirrors the public route so specs can stub storage. */
export let _fileStorageOverride: FileStorage | undefined = undefined;
export function _setFileStorageOverride(fs: FileStorage | undefined) {
  _fileStorageOverride = fs;
}
async function fileStorage(): Promise<FileStorage> {
  return _fileStorageOverride ?? (await getFileStorage());
}

/**
 * Rate limit is milder than the public form's: this is an authenticated member
 * with a name attached, so the budget is per USER, not per IP.
 */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export const load: PageServerLoad = async ({ locals }) => {
  const memberId = locals.session?.user.memberId;
  if (!memberId) redirect(303, "/app");

  const db = getDb();
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .orderBy(projects.name);

  return { projects: projectRows, maxBatchItems: MAX_BATCH_ITEMS };
};

/** The receipt the page renders in-shell (no redirect onto a public screen). */
interface Handoff {
  handoff: {
    items: {
      ausId: string;
      bezeichnung: string;
      betragCents: number;
      belegOk: boolean;
      belegMode: "file" | "verzicht";
    }[];
    gesamtCents: number;
    statusHref: string;
  };
}

export const actions: Actions = {
  default: async ({ request, locals }: import("./$types.js").RequestEvent) => {
    const memberId = locals.session?.user.memberId;
    const userId = locals.session?.user.id;
    if (!memberId || !userId) redirect(303, "/app");

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_REQUEST_BYTES) {
      return fail(413, { error: "Die Anfrage ist zu groß." });
    }

    const formData = await request.formData();
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(formData.get("data") ?? ""));
    } catch {
      return fail(400, { error: "Ungültige Anfrage." });
    }

    const db = getDb();

    // ── 1. Early nonce dedup — BEFORE the rate limiter, so a retry is never
    //       charged to the abuse budget and never re-uploads a Beleg.
    const itemNonces = Array.isArray(
      (parsed as { auslagen?: unknown[] })?.auslagen,
    )
      ? (parsed as { auslagen: Array<{ submission_nonce?: unknown }> }).auslagen
          .map((i) => i?.submission_nonce)
          .filter(
            (n): n is string =>
              typeof n === "string" &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                n,
              ),
          )
      : [];

    if (itemNonces.length > 0) {
      const existing = await db
        .select({
          businessId: auslagenSubmissions.businessId,
          bezeichnung: auslagenSubmissions.bezeichnung,
          betragCents: auslagenSubmissions.betragCents,
          belegFileId: auslagenSubmissions.belegFileId,
          submissionNonce: auslagenSubmissions.submissionNonce,
        })
        .from(auslagenSubmissions)
        // Scoped to the session member like every other portal query: a nonce
        // guessed or replayed from someone else's submission must not hand back
        // THEIR receipt.
        .where(
          and(
            inArray(auslagenSubmissions.submissionNonce, itemNonces),
            eq(auslagenSubmissions.bezahltVonMemberId, memberId),
          ),
        );
      const known = new Set(existing.map((r) => r.submissionNonce));
      if (existing.length > 0 && itemNonces.every((n) => known.has(n))) {
        // Same answer as a fresh submit: the receipt, in-shell.
        return handoffFrom(
          existing.map((r) => ({
            businessId: r.businessId,
            bezeichnung: r.bezeichnung,
            betragCents: Number(r.betragCents),
            belegOk: r.belegFileId != null,
            belegMode: (r.belegFileId != null ? "file" : "verzicht") as
              | "file"
              | "verzicht",
          })),
        );
      }
    }

    // ── 2. Rate limit (per user — an authenticated member is not an IP).
    try {
      await checkAndRecord(
        `portal:auslage:submit:${userId}`,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS,
      );
    } catch (err) {
      if (err instanceof RateLimitError) {
        return fail(429, {
          error:
            "Das waren gerade viele auf einmal — probier's in ein paar Minuten nochmal.",
        });
      }
      throw err;
    }

    // ── 3. Validate the payload (identity is NOT part of it).
    const validation = validateMemberAuslageBatchInput(parsed);
    if (!validation.ok) {
      return fail(422, {
        error: "Bitte korrigiere die markierten Felder.",
        formErrors: validation.formErrors,
        erstattungErrors: validation.erstattungErrors,
        itemErrors: validation.itemErrors,
      });
    }
    const input = validation.data;

    // ── 4. Resolve the payout IBAN (§1a A/B/C) against the STORED profile.
    const [member] = await db
      .select({
        iban: members.iban,
        vorname: members.vorname,
        nachname: members.nachname,
        email: members.email,
      })
      .from(members)
      .where(eq(members.id, memberId))
      .limit(1);
    if (!member) redirect(303, "/app");

    // The schema already normalized + checksum-validated anything typed.
    const typedIban = input.erstattung?.iban ?? null;
    const erstattungIban = typedIban ?? member.iban;
    if (!erstattungIban) {
      // Fall B with nothing entered — §7: no reimbursement without an IBAN.
      return fail(422, {
        error: "Bitte korrigiere die markierten Felder.",
        formErrors: [],
        erstattungErrors: { iban: ["Fehlt noch: IBAN fürs Zurücküberweisen."] },
        itemErrors: {},
      });
    }
    // A stored IBAN predates this validator, and we must never snapshot a
    // payout target we would refuse as fresh input.
    if (!typedIban && !validateIban(normalizeIban(erstattungIban))) {
      return fail(422, {
        error: "Bitte korrigiere die markierten Felder.",
        formErrors: [],
        erstattungErrors: { iban: [IBAN_ERROR_MESSAGE] },
        itemErrors: {},
      });
    }

    // Profile write only when the member asked for it AND actually typed one.
    const memberIbanWrite =
      typedIban && input.erstattung?.save_to_profile
        ? { memberId, iban: typedIban }
        : null;

    // ── 5. Per-item Beleg intake (storage→DB ordering) ────────────────────────
    const storage = await fileStorage();
    const items: AuslageBatchItem[] = [];
    for (let i = 0; i < input.auslagen.length; i++) {
      const item = input.auslagen[i]!;

      if (item.beleg_mode === "verzicht") {
        items.push({
          submissionNonce: item.submission_nonce ?? null,
          bezeichnung: item.bezeichnung,
          kommentar: item.kommentar ?? null,
          rechnungsdatum: item.rechnungsdatum,
          betragCents: item.betrag_cents,
          wofuer: item.wofuer ?? null,
          belegVerzichtGrund: (item.beleg_verzicht_grund ?? "").trim(),
        });
        continue;
      }

      const file = formData.get(`beleg_${i}`);
      if (!(file instanceof File) || file.size === 0) {
        return fail(422, {
          error: "Bitte korrigiere die markierten Felder.",
          formErrors: [],
          erstattungErrors: {},
          itemErrors: {
            [item.client_key]: {
              beleg: [
                "Beleg-Datei ist erforderlich — oder begründe den Verzicht.",
              ],
            },
          },
        });
      }

      const intake = await intakeBeleg({
        file,
        // `files` records exactly ONE uploader identity
        // (files_uploaded_by_one_of). A member is a logged-in user, so the user
        // id IS the identity — the submitter-email column belongs to the
        // anonymous public arm.
        submitterEmail: null,
        actorUserId: userId,
        storage,
      });
      if (!intake.ok) {
        return fail(intake.status, {
          error: intake.message,
          formErrors: [],
          erstattungErrors: {},
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

    // ── 6. Persist (ONE tx: N inserts + N audit anchors + optional profile write)
    let result: Awaited<ReturnType<typeof submitAuslagenBatch>>;
    try {
      result = await submitAuslagenBatch({
        // The submitter is the SESSION member — a payload can never name one.
        bezahltVon: {
          kind: "member",
          member_id: memberId,
          display_name: `${member.vorname} ${member.nachname}`.trim(),
          email: member.email ?? undefined,
        },
        erstattungIban,
        // A nonce replayed from another member's submission must never resolve
        // to their row (the early dedup above is scoped the same way).
        nonceScopeMemberId: memberId,
        items,
        consentTextVersion: DATENSCHUTZ_VERSION,
        actorUserId: userId,
        memberIbanWrite,
        notifyEmail: member.email,
        notifyVorname: member.vorname,
      });
    } catch (dbErr) {
      if (dbErr instanceof NonceConflictError) {
        // Not our row to resolve to — practically unreachable with UUIDv4
        // nonces, but never a 500 and never someone else's receipt.
        return fail(409, {
          error:
            "Diese Einreichung wurde schon verarbeitet. Lade die Seite neu und versuch es nochmal.",
        });
      }
      console.error("[portal/auslagen/neu] batch submit failed:", dbErr);
      return fail(500, {
        error: "Das hat gerade nicht geklappt — bitte versuch es noch einmal.",
      });
    }

    // Read the receipt back from the rows themselves. Zipping `items` (payload
    // order, NEW items only) against `result.submissions` (the WHOLE group in
    // business-id order) would mislabel every row after a partial retry, where
    // the group already contains submissions this request never sent.
    return handoffFrom(
      await readGroupRows(result.submissions.map((s) => s.businessId)),
    );
  },
};

/** The committed facts for a set of AUS-Nrn — the receipt's source of truth. */
async function readGroupRows(businessIds: string[]) {
  if (businessIds.length === 0) return [];
  const rows = await getDb()
    .select({
      businessId: auslagenSubmissions.businessId,
      bezeichnung: auslagenSubmissions.bezeichnung,
      betragCents: auslagenSubmissions.betragCents,
      belegFileId: auslagenSubmissions.belegFileId,
      belegVerzichtGrund: auslagenSubmissions.belegVerzichtGrund,
    })
    .from(auslagenSubmissions)
    .where(inArray(auslagenSubmissions.businessId, businessIds));
  return rows.map((r) => ({
    businessId: r.businessId,
    bezeichnung: r.bezeichnung,
    betragCents: Number(r.betragCents),
    belegOk: r.belegFileId != null,
    belegMode: (r.belegFileId != null ? "file" : "verzicht") as
      | "file"
      | "verzicht",
  }));
}

function handoffFrom(
  rows: {
    businessId: string;
    bezeichnung: string;
    betragCents: number;
    belegOk: boolean;
    belegMode: "file" | "verzicht";
  }[],
): Handoff {
  const sorted = [...rows].sort((a, b) =>
    a.businessId.localeCompare(b.businessId),
  );
  return {
    handoff: {
      items: sorted.map((r) => ({
        ausId: r.businessId,
        bezeichnung: r.bezeichnung,
        betragCents: r.betragCents,
        belegOk: r.belegOk,
        belegMode: r.belegMode,
      })),
      gesamtCents: sorted.reduce((sum, r) => sum + r.betragCents, 0),
      statusHref: `/portal/auslagen/${encodeURIComponent(sorted[0]?.businessId ?? "")}`,
    },
  };
}

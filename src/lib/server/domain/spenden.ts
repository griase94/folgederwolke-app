/**
 * Pure domain helpers for Spenden + Bescheinigungs-Generator.
 *
 * Phase 5 scope (per masterplan §4.2 + §5.4 + §10.6):
 *   - createSpende:           insert a Spende row (Geld/Sachspende)
 *   - editSpende:             update non-archived fields
 *   - allocateBescheinigung:  allocate next B-{YYYY}-{NNN} for a Spende
 *                             (yearly-resetting via existing id-allocator)
 *   - extractBmfPflichtfelder: derive BMF Pflichtfelder bundle from a Spende
 *   - betragInWorten:         German number-to-words for Bescheinigungs PDF
 *   - validateSpendeInput:    Zod schema validation for form actions
 *
 * D9 (Aufwandsspende) deferred to Phase 2 — `spende_kind='aufwandsspende'` is
 * present in the schema and accepted by importers, but the UI in this phase
 * only exposes Geld + Sach. The CRUD path here will reject 'aufwandsspende'
 * with a clear error so we don't accidentally ship a half-built workflow.
 *
 * Bescheinigung gating: enabled only when env.VEREIN_BESCHEID_TYP is set to
 * 'freistellungsbescheid' or 'feststellung_60a' AND a BESCHEID_DATUM is
 * present. The UI consumes `isBescheinigungEnabled()`.
 *
 * ADRs: 0001 (year_for_booking), 0002 (sphere snapshot), 0003 (cents),
 *       0006 (Festschreibung), 0010 (Business-ID + Bescheinigungs-Nr).
 */

import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { donations } from "$lib/server/db/schema/donations.js";
import { members } from "$lib/server/db/schema/members.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import {
  createDonation,
  resolveKategorieByName,
} from "$lib/server/domain/transactions.js";
import { deriveDonationKategorieName } from "$lib/domain/spenden-kategorie.js";
import { parseEuroToCents } from "$lib/domain/money.js";
import { bus } from "$lib/server/events/index.js";
import { env } from "$lib/server/env.js";
import { readStammdaten } from "$lib/server/domain/settings-stammdaten.js";
import { berlinYear } from "$lib/domain/year.js";

// Re-exported so existing `import { berlinYear } from
// "$lib/server/domain/spenden.js"` callers keep working. Canonical impl in
// `$lib/domain/year.js` (ADR-0001).
export { berlinYear };

// ---------------------------------------------------------------------------
// Bescheinigung gating
// ---------------------------------------------------------------------------

export type BescheidTyp = "freistellungsbescheid" | "feststellung_60a";

/**
 * Returns whether the Verein is configured to issue Zuwendungsbestätigungen.
 *
 * Per masterplan §2.2 + §9: requires a valid Bescheid-Typ + Bescheid-Datum.
 * If neither is set, the UI must surface a clear error and the API must
 * refuse generation.
 */
export function isBescheinigungEnabled(): boolean {
  const typ = env.VEREIN_BESCHEID_TYP.trim();
  const datum = env.VEREIN_BESCHEID_DATUM.trim();
  if (!datum) return false;
  // White-label: the steuerbegünstigte Zwecke are quoted verbatim in the BMF
  // Pflichttext. Without them we cannot render a legally-valid receipt, so
  // issuance is disabled (and the UI hides it) until configured.
  if (env.VEREIN_STEUERBEGUENSTIGTE_ZWECKE.trim().length === 0) return false;
  // White-label: the issuing Finanzamt name is interpolated verbatim into the
  // BMF Pflichttext ("wurde vom Finanzamt … bestätigt"). The env default is ""
  // — without it the receipt renders a legally-deficient "des , StNr. …", so
  // issuance is disabled (and the UI hides it) until configured.
  if (!env.VEREIN_FINANZAMT.trim()) return false;
  if (typ === "freistellungsbescheid") {
    // BMF compliance: Freistellungsbescheid wording quotes the
    // Veranlagungszeitraum verbatim — without VZ we cannot render a
    // legally-valid receipt.
    return env.VEREIN_FREISTELLUNGSBESCHEID_VZ.trim().length > 0;
  }
  if (typ === "feststellung_60a") {
    // §60a wording requires Satzungs-Fassungsdatum
    return env.VEREIN_SATZUNG_FASSUNG.trim().length > 0;
  }
  return false;
}

export function bescheidTypOrNull(): BescheidTyp | null {
  const t = env.VEREIN_BESCHEID_TYP.trim();
  if (t === "freistellungsbescheid" || t === "feststellung_60a") return t;
  return null;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const SPENDE_KINDS_UI = ["geldspende", "sachspende"] as const;

export const spendeInputSchema = z
  .object({
    spende_kind: z.enum(SPENDE_KINDS_UI, {
      message:
        "Spende-Art muss Geld- oder Sachspende sein (Aufwandsspende: Phase 2)",
    }),
    zugewendet_am: z.iso
      .date()
      .or(
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD"),
      ),
    betragCents: z.coerce
      .number()
      .int("Betrag muss ganzzahlig in Cent sein")
      .positive("Betrag muss > 0 sein")
      .max(10_000_000_00, "Betrag unrealistisch hoch"),
    currency: z
      .string()
      .length(3, "ISO-4217-Code: 3 Buchstaben")
      .default("EUR")
      .optional(),
    /** Spender entry — member_id XOR (spender_name + spender_adresse). */
    member_id: z
      .string()
      .uuid("Ungültige Mitglieds-ID")
      .optional()
      .or(z.literal("")),
    spender_name: z
      .string()
      .max(200, "Name zu lang")
      .optional()
      .or(z.literal("")),
    spender_adresse: z
      .string()
      .max(500, "Adresse zu lang")
      .optional()
      .or(z.literal("")),
    spender_email: z
      .string()
      .email("Ungültige E-Mail")
      .max(254)
      .optional()
      .or(z.literal("")),
    /**
     * Sachspende §4.3 Wertermittlung (real columns — NOT the legacy "Sache:"
     * string packed into zweckbindung_text). Both required when sachspende
     * (enforced in the superRefine + the donations_sachspende_wertermittlung_ck
     * CHECK). The Kategorie is DERIVED server-side (no UI kategorie_id), so the
     * pre-Phase-1 `kategorie_id` field is gone.
     */
    wertermittlung_methode: z
      .enum(["marktpreis", "kaufbeleg", "schaetzung", "buchwert"])
      .optional(),
    zustand_beschreibung: z
      .string()
      .max(2000, "Beschreibung zu lang")
      .optional()
      .or(z.literal("")),
    /** Optional Sachspende Herkunftsbeleg (Kaufbeleg/Foto) FK into `files`. */
    herkunftsbeleg_file_id: z.string().uuid().optional().or(z.literal("")),
    /** Optional main Beleg (Geldspende Kontoauszug, §4.3) FK into `files`. */
    beleg_file_id: z.string().uuid().optional().or(z.literal("")),
    /** SPEC-02: Sachspende aus Betriebsvermögen flag (default Privatvermögen). */
    betriebsvermoegen: z.coerce.boolean().optional(),
    zweckbindung_kind: z
      .enum(["zweckfrei", "zweckgebunden"])
      .default("zweckfrei"),
    zweckbindung_text: z.string().max(500).optional().or(z.literal("")),
    project_id: z.string().uuid().optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    // Spender: either member_id OR (name+adresse) — must have one identifiable
    const hasMember = !!(val.member_id && val.member_id.length > 0);
    const hasName = !!(val.spender_name && val.spender_name.trim().length > 0);
    if (!hasMember && !hasName) {
      ctx.addIssue({
        code: "custom",
        path: ["spender_name"],
        message:
          "Spender benötigt entweder Mitgliedsverknüpfung oder Name + Adresse",
      });
    }
    if (!hasMember && hasName) {
      const hasAdr =
        !!val.spender_adresse && val.spender_adresse.trim().length > 0;
      if (!hasAdr) {
        ctx.addIssue({
          code: "custom",
          path: ["spender_adresse"],
          message: "Externe Spender: Adresse Pflichtfeld",
        });
      }
    }
    if (val.spende_kind === "sachspende") {
      if (
        !val.zustand_beschreibung ||
        val.zustand_beschreibung.trim().length < 3
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["zustand_beschreibung"],
          message:
            "Beschreibung des Gegenstands (Art, Zustand) ist Pflichtfeld",
        });
      }
      if (!val.wertermittlung_methode) {
        ctx.addIssue({
          code: "custom",
          path: ["wertermittlung_methode"],
          message: "Wertermittlungsmethode ist Pflichtfeld",
        });
      }
    }
    if (val.zweckbindung_kind === "zweckgebunden") {
      if (!val.zweckbindung_text || val.zweckbindung_text.trim().length < 3) {
        ctx.addIssue({
          code: "custom",
          path: ["zweckbindung_text"],
          message: "Zweck muss benannt sein",
        });
      }
    }
  });

export type SpendeInput = z.infer<typeof spendeInputSchema>;

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> };

function flattenZodErrors(err: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const path = issue.path.join(".") || "_root";
    (out[path] ??= []).push(issue.message);
  }
  return out;
}

export function validateSpendeInput(
  raw: Record<string, unknown>,
): ValidationResult<SpendeInput> {
  // FormData posts numeric fields as strings — coerce known ones up-front.
  const coerced: Record<string, unknown> = { ...raw };
  if (typeof coerced.betragCents === "string") {
    const n = parseInt(coerced.betragCents, 10);
    if (Number.isFinite(n)) coerced.betragCents = n;
  }
  // Also support "betrag_eur" as a friendlier input → cents. Use the canonical
  // de-DE/English parser (F27) — the old single-comma→dot swap mangled German
  // thousands ("1.234,56" → 123 cents instead of 123456).
  if (
    coerced.betragCents === undefined &&
    typeof coerced.betrag_eur === "string"
  ) {
    try {
      coerced.betragCents = Number(parseEuroToCents(coerced.betrag_eur));
    } catch {
      // malformed — leave betragCents undefined so the Zod schema rejects it.
    }
  }
  const parsed = spendeInputSchema.safeParse(coerced);
  if (!parsed.success) {
    return { success: false, errors: flattenZodErrors(parsed.error) };
  }
  return { success: true, data: parsed.data };
}

// ---------------------------------------------------------------------------
// createSpende
// ---------------------------------------------------------------------------

export type ActionFailure = {
  ok: false;
  status: number;
  error?: string;
  errors?: Record<string, string[]>;
  values?: Record<string, unknown>;
};

export type CreateSpendeResult =
  | { ok: true; donationId: string; businessId: string }
  | ActionFailure;

export async function createSpende(
  raw: Record<string, unknown>,
  actorUserId: string | null,
): Promise<CreateSpendeResult> {
  // Aufwandsspende explicitly rejected at the API layer (defense in depth —
  // the Zod schema already blocks it).
  if (raw.spende_kind === "aufwandsspende") {
    return {
      ok: false,
      status: 422,
      error:
        "Aufwandsspende-Workflow ist in Vorbereitung (Phase 2). Bitte vorerst nicht erfassen.",
    };
  }

  const v = validateSpendeInput(raw);
  if (!v.success) {
    return { ok: false, status: 422, errors: v.errors, values: raw };
  }
  const d = v.data;

  // Pre-resolve Spender display info if member. The snapshot survives a later
  // member rename (BMF receipt requirement). For an external Spender the
  // validated name/adresse are used as-is.
  const db = getDb();
  let memberId: string | null = null;
  let spenderName = d.spender_name?.trim() || null;
  let spenderAdresse = d.spender_adresse?.trim() || null;
  let spenderEmail = d.spender_email?.trim() || null;
  if (d.member_id && d.member_id.length > 0) {
    const m = await db
      .select({
        id: members.id,
        vorname: members.vorname,
        nachname: members.nachname,
        email: members.email,
        adresse: members.adresse,
      })
      .from(members)
      .where(eq(members.id, d.member_id))
      .limit(1);
    if (!m[0]) {
      return {
        ok: false,
        status: 422,
        errors: { member_id: ["Mitglied nicht gefunden"] },
        values: raw,
      };
    }
    memberId = m[0].id;
    spenderName = `${m[0].vorname} ${m[0].nachname}`.trim();
    spenderAdresse = m[0].adresse ?? null;
    spenderEmail = m[0].email ?? null;
  }

  const zweckText =
    d.zweckbindung_kind === "zweckgebunden"
      ? d.zweckbindung_text?.trim() || null
      : null;
  const projectId =
    d.project_id && d.project_id.length > 0 ? d.project_id : null;

  // Sachspende §4.3 Wertermittlung → the real columns (NOT the legacy "Sache:"
  // string). createDonation persists these as-passed, satisfying the
  // donations_sachspende_wertermittlung_ck CHECK.
  const isSach = d.spende_kind === "sachspende";
  const wertermittlungMethode = isSach
    ? (d.wertermittlung_methode ?? null)
    : null;
  const zustandBeschreibung = isSach
    ? d.zustand_beschreibung?.trim() || null
    : null;
  const herkunftsbelegFileId =
    isSach && d.herkunftsbeleg_file_id && d.herkunftsbeleg_file_id.length > 0
      ? d.herkunftsbeleg_file_id
      : null;
  const belegFileId =
    d.beleg_file_id && d.beleg_file_id.length > 0 ? d.beleg_file_id : null;

  // Allocate business_id 'S-{YYYY}-{NNN}' (Spende prefix per business-id.ts).
  const yearForId = berlinYear(new Date(d.zugewendet_am));
  const businessId = await allocateBusinessId("S", yearForId);

  // Delegate the insert to createDonation (Phase 1): it DERIVES kategorie
  // name+id + sphere='ideeller' from (spendeKind, zweckbindungKind) — we never
  // pass a kategorie_id, and the ADR-0008 project sphere-override is NOT applied
  // to donations (§4.5: donation sphere is always ideeller). createDonation
  // fires the single append-only audit event donation.created (ADR-0004) — we
  // must NOT emit a parallel spende.created here (no duplicate audit rows).
  const { id: donationId } = await createDonation({
    betragCents: d.betragCents,
    currency: d.currency ?? "EUR",
    zugewendetAm: d.zugewendet_am,
    memberId,
    spenderName,
    spenderAdresse,
    spenderEmail,
    spendeKind: d.spende_kind,
    zweckbindungKind: d.zweckbindung_kind,
    zweckbindungText: zweckText,
    wertermittlungMethode,
    zustandBeschreibung,
    herkunftsbelegFileId,
    belegFileId,
    betriebsvermoegen: isSach ? (d.betriebsvermoegen ?? false) : false,
    projectId,
    // createDonation types actorUserId as string, but created_by_user_id is a
    // nullable FK — preserve the legacy null-actor path (createSpende accepts a
    // null actor) rather than forcing an FK-violating empty string.
    actorUserId: actorUserId as string,
    businessId,
  });

  return { ok: true, donationId, businessId };
}

// ---------------------------------------------------------------------------
// editSpende — limited surface, only mutable pre-Bescheinigung fields
// ---------------------------------------------------------------------------

export type EditSpendeResult = { ok: true } | ActionFailure;

export async function editSpende(
  raw: Record<string, unknown>,
  actorUserId: string | null,
): Promise<EditSpendeResult> {
  const idVal = typeof raw.id === "string" ? raw.id : "";
  if (!idVal) {
    return { ok: false, status: 422, error: "Spende-ID fehlt" };
  }
  // Same input validation as create
  const v = validateSpendeInput(raw);
  if (!v.success) {
    return { ok: false, status: 422, errors: v.errors, values: raw };
  }
  const d = v.data;

  const db = getDb();
  const existing = await db
    .select({
      id: donations.id,
      bescheinigungNr: donations.bescheinigungNr,
      festgeschriebenAt: donations.festgeschriebenAt,
    })
    .from(donations)
    .where(eq(donations.id, idVal))
    .limit(1);
  if (!existing[0])
    return { ok: false, status: 404, error: "Spende nicht gefunden" };
  if (existing[0].bescheinigungNr) {
    return {
      ok: false,
      status: 409,
      error:
        "Spende ist bereits bescheinigt — Storno + Neu-Erfassung notwendig (Phase 2)",
    };
  }
  if (existing[0].festgeschriebenAt) {
    return {
      ok: false,
      status: 409,
      error: "Buchungsjahr ist festgeschrieben (ADR-0006)",
    };
  }

  // Resolve the Spender snapshot (member overrides the free-text fields).
  let memberId: string | null = null;
  let spenderName = d.spender_name?.trim() || null;
  let spenderAdresse = d.spender_adresse?.trim() || null;
  let spenderEmail = d.spender_email?.trim() || null;
  if (d.member_id && d.member_id.length > 0) {
    const m = await db
      .select({
        id: members.id,
        vorname: members.vorname,
        nachname: members.nachname,
        email: members.email,
        adresse: members.adresse,
      })
      .from(members)
      .where(eq(members.id, d.member_id))
      .limit(1);
    if (!m[0]) {
      return {
        ok: false,
        status: 422,
        errors: { member_id: ["Mitglied nicht gefunden"] },
        values: raw,
      };
    }
    memberId = m[0].id;
    spenderName = `${m[0].vorname} ${m[0].nachname}`.trim();
    spenderAdresse = m[0].adresse ?? null;
    spenderEmail = m[0].email ?? null;
  }

  // Re-derive the Kategorie from the (possibly changed) Spendenart/Zweckbindung
  // using the SAME seeded lookup createDonation uses — write BOTH kategorie_id
  // AND kategorie_name_snapshot. NEVER touch sphere_snapshot: Spenden are always
  // ideeller (§4.5), fixed at create + immutable on edit.
  const kategorieName = deriveDonationKategorieName(
    d.spende_kind,
    d.zweckbindung_kind,
  );
  const kat = await resolveKategorieByName("income", kategorieName);

  const isSach = d.spende_kind === "sachspende";

  // TOCTOU: guard the write atomically — `festgeschrieben_at IS NULL` AND
  // `bescheinigung_nr IS NULL` in the WHERE so a concurrent Festschreibung or
  // Bescheinigung allocation between the SELECT above and this UPDATE cannot
  // silently overwrite a now-sealed or now-bescheinigt row. Use `.returning()`
  // as the authoritative "I actually wrote it" signal (0 rows = lost the race).
  const written = await db
    .update(donations)
    .set({
      zugewendetAm: d.zugewendet_am,
      betragCents: BigInt(d.betragCents),
      currency: d.currency ?? "EUR",
      memberId,
      spendeKind: d.spende_kind,
      spenderName,
      spenderAdresse,
      spenderEmail,
      zweckbindungKind: d.zweckbindung_kind,
      zweckbindungText:
        d.zweckbindung_kind === "zweckgebunden"
          ? d.zweckbindung_text?.trim() || null
          : null,
      kategorieId: kat.id,
      kategorieNameSnapshot: kat.name,
      // §4.3 Sachspende Wertermittlung — real columns; cleared on Geld/Aufwand.
      wertermittlungMethode: isSach ? (d.wertermittlung_methode ?? null) : null,
      zustandBeschreibung: isSach
        ? d.zustand_beschreibung?.trim() || null
        : null,
      herkunftsbelegFileId:
        isSach &&
        d.herkunftsbeleg_file_id &&
        d.herkunftsbeleg_file_id.length > 0
          ? d.herkunftsbeleg_file_id
          : null,
      betriebsvermoegen: isSach ? (d.betriebsvermoegen ?? false) : false,
      projectId: d.project_id && d.project_id.length > 0 ? d.project_id : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(donations.id, idVal),
        isNull(donations.festgeschriebenAt),
        isNull(donations.bescheinigungNr),
      ),
    )
    .returning({ id: donations.id });

  if (written.length === 0) {
    // Re-read to distinguish festgeschrieben vs. bescheinigt (both are 409 but
    // with different messages — mirror the pre-check message contract so the
    // caller can surface the right error to the user).
    const cur = await db
      .select({
        bescheinigungNr: donations.bescheinigungNr,
        festgeschriebenAt: donations.festgeschriebenAt,
      })
      .from(donations)
      .where(eq(donations.id, idVal))
      .limit(1);
    if (!cur[0]) {
      return { ok: false, status: 404, error: "Spende nicht gefunden" };
    }
    if (cur[0].bescheinigungNr) {
      return {
        ok: false,
        status: 409,
        error:
          "Spende ist bereits bescheinigt — Storno + Neu-Erfassung notwendig (Phase 2)",
      };
    }
    return {
      ok: false,
      status: 409,
      error: "Buchungsjahr ist festgeschrieben (ADR-0006)",
    };
  }

  await bus.emit("spende.edited", {
    donationId: idVal,
    actorUserId,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// allocateBescheinigung — claim B-{YYYY}-{NNN} for an existing Spende
// ---------------------------------------------------------------------------

export interface BmfPflichtfelder {
  vereinName: string;
  vereinSteuernummer: string;
  vereinVr: string;
  vereinAdresse: string;
  /**
   * Full name of the issuing Finanzamt (e.g. "Finanzamt München"). Rendered
   * verbatim in the BMF Pflichttext — white-label: sourced from
   * env.VEREIN_FINANZAMT, NOT extracted from the address city.
   */
  vereinFinanzamt: string;
  bescheidTyp: BescheidTyp;
  bescheidDatum: string; // YYYY-MM-DD
  /** Required iff bescheidTyp = feststellung_60a. */
  satzungsFassung: string | null;
  /** Required iff bescheidTyp = freistellungsbescheid. */
  freistellungsbescheidVz: string | null;
  steuerbegueZwecke: string;

  spenderName: string;
  spenderAdresse: string;
  spendeDatum: string; // YYYY-MM-DD
  betragCents: bigint;
  betragInWorten: string;
  spendeKind: "geldspende" | "sachspende";
  /** Sachspende: description + Wertermittlung. Null on Geldspende. */
  sacheBeschreibung: string | null;
  zweckbindungKind: "zweckfrei" | "zweckgebunden";
  zweckbindungText: string | null;
  bescheinigungNr: string;
  ausgestelltAm: string; // YYYY-MM-DD
}

export type AllocateBescheinigungResult =
  | { ok: true; pflichtfelder: BmfPflichtfelder; bescheinigungNr: string }
  | ActionFailure;

export async function allocateBescheinigung(
  donationId: string,
  actorUserId: string | null,
): Promise<AllocateBescheinigungResult> {
  if (!isBescheinigungEnabled()) {
    return {
      ok: false,
      status: 412,
      error:
        "Bescheinigung kann nicht generiert werden — Freistellungsbescheid fehlt in den Einstellungen",
    };
  }
  const typ = bescheidTypOrNull();
  if (!typ) {
    return { ok: false, status: 412, error: "Bescheid-Typ ungültig" };
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(donations)
    .where(eq(donations.id, donationId))
    .limit(1);
  const sp = rows[0];
  if (!sp) return { ok: false, status: 404, error: "Spende nicht gefunden" };
  if (sp.spendeKind === "aufwandsspende") {
    return {
      ok: false,
      status: 422,
      error: "Aufwandsspende-Bescheinigung in Phase 2 verfügbar",
    };
  }
  if (sp.festgeschriebenAt) {
    return {
      ok: false,
      status: 409,
      error: "Buchungsjahr ist festgeschrieben (ADR-0006)",
    };
  }

  const spenderName = sp.spenderName?.trim() ?? "";
  const spenderAdresse = sp.spenderAdresse?.trim() ?? "";
  if (!spenderName) {
    return {
      ok: false,
      status: 422,
      error: "Spender-Name ist Pflichtfeld der Bescheinigung",
    };
  }
  if (!spenderAdresse) {
    return {
      ok: false,
      status: 422,
      error: "Spender-Adresse ist Pflichtfeld der Bescheinigung",
    };
  }
  if (!sp.zugewendetAm) {
    return {
      ok: false,
      status: 422,
      error: "Zuwendungsdatum ist Pflichtfeld der Bescheinigung",
    };
  }

  // Yearly reset: derive year from zugewendetAm — id-allocator already shards
  // (year, kind) so two donations in different years get B-{YYYY}-001 each.
  const year = parseInt(sp.zugewendetAm.slice(0, 4), 10);
  const today = new Date().toISOString().slice(0, 10);

  // Allocate inside a tx so the UPDATE + allocator lock-release are coherent.
  let bescheinigungNr: string;
  await db.transaction(async (tx) => {
    // Re-check we haven't already issued a Bescheinigung for this donation —
    // if we have, do NOT allocate a new id (idempotent: surface existing one).
    const cur = await tx
      .select({ bescheinigungNr: donations.bescheinigungNr })
      .from(donations)
      .where(eq(donations.id, donationId))
      .limit(1);
    if (cur[0]?.bescheinigungNr) {
      bescheinigungNr = cur[0].bescheinigungNr;
      return;
    }
    bescheinigungNr = await allocateBusinessId("B", year);

    // `allocateBusinessId` commits on its OWN transaction, so between the
    // re-check above and this UPDATE a CONCURRENT allocateBescheinigung call
    // could have already set bescheinigung_nr for this donation. The
    // `bescheinigung_nr IS NULL` guard then matches 0 rows — and our freshly
    // allocated `bescheinigungNr` is orphaned (the row kept the WINNER's
    // number). Mirror the markExpenseAsPaid "I won the race" pattern: use
    // RETURNING as the authoritative "I actually wrote it" signal, and on a
    // 0-row UPDATE re-read the row and return the idempotent winner instead of
    // the number we never persisted.
    const written = await tx
      .update(donations)
      .set({
        bescheinigungNr,
        bescheinigungAusgestelltAm: today,
        bescheinigungAusgestelltVonUserId: actorUserId,
        bescheidTyp:
          sp.spendeKind === "sachspende" ? "sachspende" : "geldspende",
        updatedAt: new Date(),
      })
      .where(and(eq(donations.id, donationId), sql`bescheinigung_nr IS NULL`))
      .returning({ bescheinigungNr: donations.bescheinigungNr });

    if (written.length === 0) {
      // We lost the race: a concurrent caller won. Re-read + surface THEIR
      // number (the row's actual value), discarding our orphaned allocation.
      const winner = await tx
        .select({ bescheinigungNr: donations.bescheinigungNr })
        .from(donations)
        .where(eq(donations.id, donationId))
        .limit(1);
      if (winner[0]?.bescheinigungNr) {
        bescheinigungNr = winner[0].bescheinigungNr;
      }
    }
  });

  const betragCents = sp.betragCents;
  const betragInWortenStr = betragInWorten(betragCents);
  // §4.3: read the real Sachspende column (NOT the legacy "Sache:" string).
  const sacheBeschreibung =
    sp.spendeKind === "sachspende" ? (sp.zustandBeschreibung ?? null) : null;

  // BMF compliance: VZ / Satzungsfassung are quoted verbatim in the
  // Pflichttext block. Guard non-empty so we never emit "-" placeholders.
  const vz = env.VEREIN_FREISTELLUNGSBESCHEID_VZ.trim();
  if (typ === "freistellungsbescheid" && vz.length === 0) {
    return {
      ok: false,
      status: 412,
      error:
        "VEREIN_FREISTELLUNGSBESCHEID_VZ fehlt — Bescheinigung nicht erstellbar",
    };
  }
  const satzungsFassung = env.VEREIN_SATZUNG_FASSUNG.trim();
  if (typ === "feststellung_60a" && satzungsFassung.length === 0) {
    return {
      ok: false,
      status: 412,
      error: "VEREIN_SATZUNG_FASSUNG fehlt — Bescheinigung nicht erstellbar",
    };
  }
  // White-label: the steuerbegünstigte Zwecke are quoted verbatim in the BMF
  // Pflichttext. Refuse rather than render an empty Zweck (mirrors the VZ /
  // Satzungsfassung 412 guards above).
  if (env.VEREIN_STEUERBEGUENSTIGTE_ZWECKE.trim().length === 0) {
    return {
      ok: false,
      status: 412,
      error:
        "VEREIN_STEUERBEGUENSTIGTE_ZWECKE fehlt — Bescheinigung nicht erstellbar",
    };
  }

  // White-label: Verein-Stammdaten (name, address, Steuernummer, VR) come from
  // the single settings→env reader; Finanzamt + Bescheid fields stay env
  // (issuance config, not Stammdaten).
  const sd = await readStammdaten();
  const pflichtfelder: BmfPflichtfelder = {
    vereinName: sd.name,
    vereinSteuernummer: sd.steuernummer,
    vereinVr: sd.vr,
    vereinAdresse: sd.adresse,
    vereinFinanzamt: env.VEREIN_FINANZAMT,
    bescheidTyp: typ,
    bescheidDatum: env.VEREIN_BESCHEID_DATUM,
    satzungsFassung: typ === "feststellung_60a" ? satzungsFassung : null,
    freistellungsbescheidVz: typ === "freistellungsbescheid" ? vz : null,
    steuerbegueZwecke: env.VEREIN_STEUERBEGUENSTIGTE_ZWECKE,

    spenderName,
    spenderAdresse,
    spendeDatum: sp.zugewendetAm,
    betragCents,
    betragInWorten: betragInWortenStr,
    spendeKind: sp.spendeKind === "sachspende" ? "sachspende" : "geldspende",
    sacheBeschreibung,
    zweckbindungKind: sp.zweckbindungKind,
    zweckbindungText:
      sp.zweckbindungKind === "zweckgebunden" ? sp.zweckbindungText : null,
    bescheinigungNr: bescheinigungNr!,
    ausgestelltAm: today,
  };

  await bus.emit("spende.bescheinigung_generated", {
    donationId,
    bescheinigungNr: bescheinigungNr!,
    actorUserId,
    betragCents: Number(betragCents),
  });

  return { ok: true, pflichtfelder, bescheinigungNr: bescheinigungNr! };
}

// ---------------------------------------------------------------------------
// extractBmfPflichtfelder — pure read-only variant (for preview / re-render)
// ---------------------------------------------------------------------------

/**
 * Build the Pflichtfelder bundle for an *already-bescheinigt* Spende, used
 * when the user re-downloads the PDF after the initial allocation. Throws
 * if the Spende is missing required fields — caller must surface the error.
 */
export async function extractBmfPflichtfelder(
  sp: typeof donations.$inferSelect,
): Promise<BmfPflichtfelder> {
  if (!isBescheinigungEnabled()) {
    throw new Error(
      "Bescheinigung disabled — Freistellungsbescheid fehlt in den Einstellungen",
    );
  }
  const typ = bescheidTypOrNull();
  if (!typ) throw new Error("Bescheid-Typ ungültig");
  if (!sp.bescheinigungNr || !sp.bescheinigungAusgestelltAm) {
    throw new Error("Spende hat keine Bescheinigungs-Nr");
  }
  if (!sp.spenderName || !sp.spenderAdresse || !sp.zugewendetAm) {
    throw new Error("Spende fehlt Pflichtfelder");
  }
  // BMF compliance: Freistellungsbescheid wording quotes VZ — assert
  // non-empty so we never render a Bescheinigung with a "-" placeholder.
  const vz = env.VEREIN_FREISTELLUNGSBESCHEID_VZ.trim();
  if (typ === "freistellungsbescheid" && vz.length === 0) {
    throw new Error(
      "VEREIN_FREISTELLUNGSBESCHEID_VZ fehlt — Bescheinigung nicht renderbar",
    );
  }
  const satzungsFassung = env.VEREIN_SATZUNG_FASSUNG.trim();
  if (typ === "feststellung_60a" && satzungsFassung.length === 0) {
    throw new Error(
      "VEREIN_SATZUNG_FASSUNG fehlt — Bescheinigung nicht renderbar",
    );
  }
  // White-label: the steuerbegünstigte Zwecke are quoted verbatim — refuse
  // rather than render an empty Zweck (mirrors the VZ / Satzungsfassung guards).
  if (env.VEREIN_STEUERBEGUENSTIGTE_ZWECKE.trim().length === 0) {
    throw new Error(
      "VEREIN_STEUERBEGUENSTIGTE_ZWECKE fehlt — Bescheinigung nicht renderbar",
    );
  }
  // §4.3: read the real Sachspende column (NOT the legacy "Sache:" string).
  const sacheBeschreibung =
    sp.spendeKind === "sachspende" ? (sp.zustandBeschreibung ?? null) : null;
  // White-label: Stammdaten from settings; Finanzamt + Bescheid from env.
  const sd = await readStammdaten();
  return {
    vereinName: sd.name,
    vereinSteuernummer: sd.steuernummer,
    vereinVr: sd.vr,
    vereinAdresse: sd.adresse,
    vereinFinanzamt: env.VEREIN_FINANZAMT,
    bescheidTyp: typ,
    bescheidDatum: env.VEREIN_BESCHEID_DATUM,
    satzungsFassung: typ === "feststellung_60a" ? satzungsFassung : null,
    freistellungsbescheidVz: typ === "freistellungsbescheid" ? vz : null,
    steuerbegueZwecke: env.VEREIN_STEUERBEGUENSTIGTE_ZWECKE,
    spenderName: sp.spenderName,
    spenderAdresse: sp.spenderAdresse,
    spendeDatum: sp.zugewendetAm,
    betragCents: sp.betragCents,
    betragInWorten: betragInWorten(sp.betragCents),
    spendeKind: sp.spendeKind === "sachspende" ? "sachspende" : "geldspende",
    sacheBeschreibung,
    zweckbindungKind: sp.zweckbindungKind,
    zweckbindungText:
      sp.zweckbindungKind === "zweckgebunden" ? sp.zweckbindungText : null,
    bescheinigungNr: sp.bescheinigungNr,
    ausgestelltAm: sp.bescheinigungAusgestelltAm,
  };
}

// ---------------------------------------------------------------------------
// betragInWorten — German number-to-words (Euro + Cent)
// ---------------------------------------------------------------------------

const ONES = [
  "",
  "ein", // 1 — "ein Euro", not "eins Euro" — BMF Vordruck convention
  "zwei",
  "drei",
  "vier",
  "fünf",
  "sechs",
  "sieben",
  "acht",
  "neun",
  "zehn",
  "elf",
  "zwölf",
  "dreizehn",
  "vierzehn",
  "fünfzehn",
  "sechzehn",
  "siebzehn",
  "achtzehn",
  "neunzehn",
];
const TENS = [
  "",
  "",
  "zwanzig",
  "dreißig",
  "vierzig",
  "fünfzig",
  "sechzig",
  "siebzig",
  "achtzig",
  "neunzig",
];

function under100ToWords(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (ones === 0) return TENS[tens] ?? "";
  // "ein-und-zwanzig"
  const onesWord = ones === 1 ? "ein" : ONES[ones];
  return `${onesWord}und${TENS[tens]}`;
}

function under1000ToWords(n: number): string {
  if (n === 0) return "";
  if (n < 100) return under100ToWords(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const hundredsWord =
    hundreds === 1 ? "einhundert" : `${ONES[hundreds]}hundert`;
  if (rest === 0) return hundredsWord;
  return `${hundredsWord}${under100ToWords(rest)}`;
}

function integerToWords(n: number): string {
  if (n === 0) return "null";
  if (n < 0) return `minus ${integerToWords(-n)}`;
  if (n < 1000) return under1000ToWords(n);
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000);
    const rest = n % 1000;
    const thWord = th === 1 ? "eintausend" : `${under1000ToWords(th)}tausend`;
    if (rest === 0) return thWord;
    return `${thWord}${under1000ToWords(rest)}`;
  }
  if (n < 1_000_000_000) {
    const mi = Math.floor(n / 1_000_000);
    const rest = n % 1_000_000;
    const miWord =
      mi === 1 ? "eine Million " : `${under1000ToWords(mi)} Millionen `;
    if (rest === 0) return miWord.trimEnd();
    return `${miWord}${integerToWords(rest)}`;
  }
  // > billion: return numeric fallback string. Highly unlikely for a Spende.
  return n.toString();
}

/**
 * Returns a German number-to-words representation of a cents amount.
 *
 *   100   → "ein Euro"
 *   199   → "ein Euro und neunundneunzig Cent"
 *   32709 → "dreihundertsiebenundzwanzig Euro und neun Cent"
 *
 * Capitalises the first letter — Bescheinigungs-Vordruck convention.
 */
export function betragInWorten(cents: bigint | number): string {
  const c = typeof cents === "bigint" ? Number(cents) : Math.trunc(cents);
  if (!Number.isFinite(c)) return "";
  const sign = c < 0 ? "minus " : "";
  const abs = Math.abs(c);
  const euro = Math.floor(abs / 100);
  const cent = abs % 100;
  const euroWord =
    euro === 0 ? "null" : euro === 1 ? "ein" : integerToWords(euro);
  const euroLabel = euro === 1 ? "Euro" : "Euro";
  let s = `${sign}${euroWord} ${euroLabel}`;
  if (cent > 0) {
    const centWord = cent === 1 ? "ein" : integerToWords(cent);
    s += ` und ${centWord} Cent`;
  }
  // Capitalise first letter (preserve "ä/ö/ü" if it ever shows up — none of
  // the words above start with one, so plain charAt is fine).
  return s.charAt(0).toUpperCase() + s.slice(1);
}

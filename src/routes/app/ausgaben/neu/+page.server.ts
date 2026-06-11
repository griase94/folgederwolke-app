/**
 * /app/ausgaben/neu — Ausgabe direct-entry (Phase 4, Tier C1, Task 4).
 *
 * load(): zahlungsarten + members + expense Kategorie options + smart-default
 *         Kategorie + active projects (+ optional ?projectId= prefill). The
 *         Kategorie picker drives the Sphäre STRICTLY (spec §4.5) — derived
 *         server-side inside createExpense, never from a project override.
 *
 * actions:
 *   ?/create — validate + create the Ausgabe, then branch on the payment path
 *              (review-amendment matrix):
 *                Verein                  → createExpense, then
 *                                          markExpenseAsPaid(id, { datum,
 *                                          zahlartId, actorUserId }) — POSITIONAL,
 *                                          no member mail.
 *                Mitglied/Extern default → createExpense only (Auslagenflow:
 *                                          stays geprueft, awaiting Erstattung).
 *                Mitglied/Extern + admin "Schon bezahlt?"
 *                                        → createExpense, then
 *                                          markExpenseErstattet({ expenseId,
 *                                          chosenDate, zahlungsartId,
 *                                          actorUserId }) — fires the SEPA-payout
 *                                          confirmation mail (no `notify` knob).
 *              Beleg gate (spec §4.1): EITHER a Beleg file OR an explicit
 *              "kein Beleg" + Begründung; neither → fail(422).
 *              Redirects to /app/ausgaben/[id] on success.
 */

import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { isoCalendarDate } from "$lib/domain/date.js";
import { errorsFromIssues } from "$lib/domain/zod-errors.js";
import type { Actions, PageServerLoad } from "./$types.js";
import {
  createExpense,
  markExpenseAsPaid,
  checkFestschreibungGate,
  listZahlungsarten,
} from "$lib/server/domain/transactions.js";
import { markExpenseErstattet } from "$lib/server/domain/audit-inbox-actions.js";
import {
  listKategorieOptions,
  loadRecentKategorieUsage,
  pickDefaultKategorieName,
} from "$lib/server/domain/transaction-pickers.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { asc, isNull } from "drizzle-orm";
import { handleAuslageUpload } from "$lib/server/files/handleAuslageUpload.js";
import { bookingYearFromCashDate } from "$lib/domain/year.js";

function berlinYear(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      year: "numeric",
    }).format(new Date()),
    10,
  );
}

/**
 * The form re-hydration shape — shared by the duplicate-as-template prefill
 * (load reads it off the query string) AND the 422 re-hydrate (?/create echoes
 * the submitted values back). `betrag` is the EUROS string the display input
 * binds (cents are derived from it client-side), so on prefill we convert
 * `betragCents` → euros and on a failed submit we echo whatever the user typed.
 */
export interface AusgabeFormValues {
  bezeichnung: string;
  betrag: string;
  kategorieNameSnapshot: string;
  kommentar: string;
  projectId: string;
  bezahltVonKind: "verein" | "member" | "extern";
  bezahltVonMemberId: string;
  externName: string;
  externIban: string;
  externEmail: string;
  rechnungsdatum: string;
  abflussDatum: string;
  zahlungsartId: string;
  schonBezahlt: boolean;
  erstattetAm: string;
  keinBeleg: boolean;
  begruendung: string;
}

const EMPTY_VALUES: AusgabeFormValues = {
  bezeichnung: "",
  betrag: "",
  kategorieNameSnapshot: "",
  kommentar: "",
  projectId: "",
  bezahltVonKind: "verein",
  bezahltVonMemberId: "",
  externName: "",
  externIban: "",
  externEmail: "",
  rechnungsdatum: "",
  abflussDatum: "",
  zahlungsartId: "",
  schonBezahlt: false,
  erstattetAm: "",
  keinBeleg: false,
  begruendung: "",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BEZAHLT_VON = ["verein", "member", "extern"] as const;

/** centsstring → "euros" with 2 decimals (e.g. "45000" → "450.00"). */
function centsToEuros(cents: string | null): string {
  if (!cents) return "";
  const n = Number(cents);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : "";
}

/**
 * Build the duplicate-as-template prefill from the entry-form query string. Only
 * the descriptive fields the detail `?/duplicate` forwards are read; the payment
 * state (zahlungsart / erstattetAm / schonBezahlt) and the Beleg are NEVER
 * prefilled (spec §7.2 recurring-Miete safety — a duplicate starts unpaid).
 */
function parsePrefill(searchParams: URLSearchParams): AusgabeFormValues {
  const kindRaw = searchParams.get("bezahltVonKind");
  const bezahltVonKind = (BEZAHLT_VON as readonly string[]).includes(
    kindRaw ?? "",
  )
    ? (kindRaw as AusgabeFormValues["bezahltVonKind"])
    : "verein";
  const memberId = searchParams.get("bezahltVonMemberId");
  return {
    ...EMPTY_VALUES,
    bezeichnung: searchParams.get("bezeichnung") ?? "",
    betrag: centsToEuros(searchParams.get("betragCents")),
    kategorieNameSnapshot: searchParams.get("kategorieNameSnapshot") ?? "",
    kommentar: searchParams.get("kommentar") ?? "",
    projectId: searchParams.get("projectId") ?? "",
    bezahltVonKind,
    bezahltVonMemberId: memberId && UUID_RE.test(memberId) ? memberId : "",
    externName: searchParams.get("externName") ?? "",
    externIban: searchParams.get("externIban") ?? "",
    externEmail: searchParams.get("externEmail") ?? "",
  };
}

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ locals, url }) => {
  const db = getDb();
  const userId = locals.session?.user?.id ?? null;

  // C1-PRJ-A: `?projectId=` deep-links into this form with the project
  // preselected. Validated UUID shape here; the action's Zod re-validates.
  const prefillProjectIdRaw = url.searchParams.get("projectId");
  const prefillProjectId =
    prefillProjectIdRaw &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      prefillProjectIdRaw,
    )
      ? prefillProjectIdRaw
      : null;

  const [zahlungsarten, allMembers, expenseKategorien, recent, allProjects] =
    await Promise.all([
      listZahlungsarten(),
      db
        .select({
          id: members.id,
          vorname: members.vorname,
          nachname: members.nachname,
          email: members.email,
          iban: members.iban,
        })
        .from(members)
        .orderBy(asc(members.nachname)),
      listKategorieOptions("expense"),
      userId ? loadRecentKategorieUsage(userId) : Promise.resolve([]),
      db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(isNull(projects.deletedAt))
        .orderBy(projects.name),
    ]);

  const defaultExpenseKategorie = pickDefaultKategorieName({
    kategorien: expenseKategorien,
    recent,
    projectId: null,
    kind: "expense",
  });

  // Duplicate-as-template prefill (Fix 1): the detail `?/duplicate` redirects
  // here with the descriptive fields on the query string. `values` seeds the
  // form; a fresh /neu visit yields all-empty values. `?projectId=` (the
  // ProjectCtaRail deep-link) merges into the prefill's projectId.
  const prefill = parsePrefill(url.searchParams);
  const values: AusgabeFormValues = {
    ...prefill,
    projectId: prefill.projectId || prefillProjectId || "",
    // No descriptive prefill → land on the smart-default Kategorie.
    kategorieNameSnapshot:
      prefill.kategorieNameSnapshot || (defaultExpenseKategorie ?? ""),
  };

  return {
    zahlungsarten,
    members: allMembers,
    expenseKategorien,
    defaultExpenseKategorie,
    projects: allProjects,
    prefillProjectId,
    values,
  };
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const sphereValues = [
  "ideeller",
  "vermoegen",
  "zweckbetrieb",
  "wirtschaftlich",
] as const;

const expenseSchema = z.object({
  bezeichnung: z.string().min(1).max(500),
  betragCents: z.coerce.number().int().positive(),
  currency: z.string().default("EUR"),
  kategorieNameSnapshot: z
    .string()
    .min(1)
    .max(200)
    .refine((v) => v !== "(Unkategorisiert)", {
      message: "Kategorie muss ausgewählt werden",
    }),
  // Sphere is re-derived inside createExpense (§4.5); accepted-but-ignored for
  // caller parity. Kept in the schema so a tampered/absent value never breaks.
  sphereSnapshot: z.enum(sphereValues).optional(),
  kommentar: z.string().max(2000).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  // EÜR §11 EStG: invoice date + cash-out (Abfluss) date both required.
  // `isoCalendarDate` rejects impossible dates (2026-02-30) as a 422 field
  // error instead of letting them reach a Postgres ::date cast → opaque 500.
  rechnungsdatum: isoCalendarDate,
  abfluss_datum: isoCalendarDate,
  // Admin direct path defaults to Verein-paid (members come via the public
  // Auslage form); the tab can switch to member/extern.
  bezahltVonKind: z.enum(["verein", "member", "extern"]).default("verein"),
  bezahltVonMemberId: z.string().uuid().nullable().optional(),
  bezahltVonDisplay: z.string().max(200).default("(unbekannt)"),
  externName: z.string().max(200).nullable().optional(),
  externIban: z.string().max(50).nullable().optional(),
  externEmail: z.string().email().nullable().optional(),
  // Zahlungsart for the payment path (Verein auto-pay / Schon-bezahlt Erstattung).
  zahlungsartId: z.string().uuid().nullable().optional(),
  // Admin "Schon bezahlt?" toggle (member/extern reveal) + its Erstattungsdatum.
  schonBezahlt: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  erstattetAm: isoCalendarDate.nullable().optional(),
});

// ---------------------------------------------------------------------------
// 422 re-hydration helpers (Fix 2)
// ---------------------------------------------------------------------------

/** Re-build the form values from the submitted FormData so a 422 re-hydrates. */
function valuesFromForm(data: FormData): AusgabeFormValues {
  const str = (k: string): string => {
    const v = data.get(k);
    return typeof v === "string" ? v : "";
  };
  const kindRaw = str("bezahltVonKind");
  const bezahltVonKind = (BEZAHLT_VON as readonly string[]).includes(kindRaw)
    ? (kindRaw as AusgabeFormValues["bezahltVonKind"])
    : "verein";
  return {
    bezeichnung: str("bezeichnung"),
    // Echo the typed euros back (the hidden betragCents mirrors it client-side).
    betrag: centsToEuros(str("betragCents")),
    kategorieNameSnapshot: str("kategorieNameSnapshot"),
    kommentar: str("kommentar"),
    projectId: str("projectId"),
    bezahltVonKind,
    bezahltVonMemberId: str("bezahltVonMemberId"),
    externName: str("externName"),
    externIban: str("externIban"),
    externEmail: str("externEmail"),
    rechnungsdatum: str("rechnungsdatum"),
    abflussDatum: str("abfluss_datum"),
    zahlungsartId: str("zahlungsartId"),
    schonBezahlt: str("schonBezahlt") === "true",
    erstattetAm: str("erstattetAm"),
    keinBeleg: str("keinBeleg") === "true",
    begruendung: str("begruendung"),
  };
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

export const actions = {
  create: async ({ request, locals }) => {
    const user = locals.session?.user;
    if (!user) return fail(401, { error: "Nicht angemeldet" });

    const data = await request.formData();
    const raw = Object.fromEntries(
      [...data.entries()]
        .filter(([, v]) => !(v instanceof File))
        .map(([k, v]) => [k, v === "" ? null : v]),
    );

    const parsed = expenseSchema.safeParse(raw);
    if (!parsed.success) {
      // Fix 2: echo the submitted values + per-field errors so the form
      // re-hydrates (Spenden parity) instead of wiping everything.
      return fail(422, {
        error: "Ungültige Eingabe",
        values: valuesFromForm(data),
        errors: errorsFromIssues(parsed.error.issues),
        issues: parsed.error.issues,
      });
    }

    // ── Beleg-or-Begründung gate (spec §4.1) ──────────────────────────────
    // Satisfied by EITHER an attached Beleg file OR an explicit "kein Beleg"
    // with a non-empty Begründung. Neither → 422.
    const belegFormField = data.get("beleg");
    const hasBelegFile =
      belegFormField instanceof File && belegFormField.size > 0;
    const keinBeleg = data.get("keinBeleg") === "true";
    const begruendung = String(data.get("begruendung") ?? "").trim();

    if (!hasBelegFile && !(keinBeleg && begruendung.length > 0)) {
      return fail(422, {
        error:
          "Bitte einen Beleg hochladen oder „Kein Beleg vorhanden“ mit Begründung wählen.",
        values: valuesFromForm(data),
        errors: {
          beleg: ["Beleg-Datei ODER eine Begründung ist erforderlich."],
        },
      });
    }

    // Festschreibung gate (ADR-0006): the new expense's year_of_buchung
    // derives from abfluss_datum (the cash-out date) per migration 0034, so
    // gate on year(abfluss_datum) — NOT the current calendar year. Otherwise a
    // prior-year cash-out booked in a closed year would pass the app gate and
    // be rejected only by the DB trigger (opaque 23514). abfluss_datum is
    // required by the Zod schema; bookingYearFromCashDate falls back to the
    // current Berlin year if it were ever absent.
    const year = berlinYear();
    const gateYear = bookingYearFromCashDate(parsed.data.abfluss_datum);
    const gate = await checkFestschreibungGate(gateYear);
    if (!gate.ok) return fail(gate.status, { error: gate.error });

    try {
      // Upload the Beleg if one was attached (else the kein-Beleg path persists
      // the Verzicht-Begründung instead).
      let belegFileId: string | null = null;
      if (hasBelegFile) {
        try {
          const uploadResult = await handleAuslageUpload(belegFormField, {
            actorUserId: user.id,
            sourceKind: "app",
          });
          belegFileId = uploadResult.fileId;
        } catch (uploadErr) {
          const msg =
            uploadErr instanceof Error
              ? uploadErr.message
              : "Beleg konnte nicht hochgeladen werden.";
          return fail(422, {
            error: msg,
            values: valuesFromForm(data),
            errors: { beleg: [msg] },
          });
        }
      }

      // `A-` prefix for admin direct entries (AUS- is reserved for the public
      // Auslage form → inbox flow). createExpense derives kategorie + sphere
      // strictly from the picked name (§4.5) and persists abfluss_datum.
      const businessId = await allocateBusinessId("A", year);
      const { bezahltVonKind } = parsed.data;
      const result = await createExpense({
        bezeichnung: parsed.data.bezeichnung,
        betragCents: parsed.data.betragCents,
        currency: parsed.data.currency,
        rechnungsdatum: parsed.data.rechnungsdatum,
        abflussDatum: parsed.data.abfluss_datum,
        kommentar: parsed.data.kommentar ?? null,
        kategorieNameSnapshot: parsed.data.kategorieNameSnapshot,
        bezahltVonKind,
        bezahltVonMemberId: parsed.data.bezahltVonMemberId ?? null,
        bezahltVonDisplay:
          parsed.data.bezahltVonDisplay ||
          parsed.data.externName ||
          "Unbekannt",
        externName: parsed.data.externName ?? null,
        externIban: parsed.data.externIban ?? null,
        externEmail: parsed.data.externEmail ?? null,
        projectId: parsed.data.projectId ?? null,
        belegFileId,
        belegVerzichtGrund: belegFileId ? null : begruendung,
        actorUserId: user.id,
        businessId,
      });

      // ── Payment path branch (review-amendment matrix) ───────────────────
      // Role gate (§7.2 admin-only): the Verein auto-pay + "Schon bezahlt?"
      // Erstattung paths below are reachable only by an admin. `/app/*` is
      // admin-only BY CONVENTION — `resolveSession` (auth/index.ts) re-checks the
      // ADMIN_EMAILS allowlist on every request and DELETES the session +
      // returns null for any non-admin, and hooks.server.ts redirects a null
      // session away from `/app`. So a non-admin can never hold a `locals.session`
      // here; the `if (!user) return 401` at the top of the action is the
      // effective admin gate. No extra per-branch role check is needed.
      if (bezahltVonKind === "verein") {
        // Verein-paid → mark paid immediately, NO member mail. The cash-out
        // date IS the Abfluss date. Zahlungsart is optional (positional helper).
        const paidResult = await markExpenseAsPaid(result.id, {
          datum: parsed.data.abfluss_datum,
          zahlartId: parsed.data.zahlungsartId ?? null,
          actorUserId: user.id,
        });
        if (!paidResult.ok) {
          return fail(409, { error: paidResult.error });
        }
      } else if (parsed.data.schonBezahlt) {
        // Mitglied/Extern + admin "Schon bezahlt?" → fire the SEPA-payout
        // confirmation mail via markExpenseErstattet (needs a non-null
        // Zahlungsart + an existing approvedAt, which createExpense set).
        const chosenDate = parsed.data.erstattetAm ?? parsed.data.abfluss_datum;
        const zahlungsartId = parsed.data.zahlungsartId;
        if (!zahlungsartId) {
          return fail(422, {
            error: "Zahlungsart ist für „Schon bezahlt“ erforderlich.",
            values: valuesFromForm(data),
            errors: {
              zahlungsartId: [
                "Zahlungsart ist für „Schon bezahlt“ erforderlich.",
              ],
            },
          });
        }
        const erstattetResult = await markExpenseErstattet({
          expenseId: result.id,
          chosenDate,
          zahlungsartId,
          actorUserId: user.id,
        });
        if (!erstattetResult.ok) {
          return fail(erstattetResult.status, { error: erstattetResult.error });
        }
      }
      // else: Mitglied/Extern default → Auslagenflow, stays geprueft (no auto-pay).

      redirect(303, `/app/ausgaben/${result.id}`);
    } catch (err) {
      // SvelteKit redirect throws — rethrow it.
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        "location" in err
      ) {
        throw err;
      }
      console.error("[ausgaben/neu/create]", err);
      return fail(500, { error: "Interner Fehler beim Speichern" });
    }

    return fail(400, { error: "Unbekannter Fehler" });
  },
} satisfies Actions;

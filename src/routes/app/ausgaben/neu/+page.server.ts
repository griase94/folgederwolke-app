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

function berlinYear(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      year: "numeric",
    }).format(new Date()),
    10,
  );
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

  return {
    zahlungsarten,
    members: allMembers,
    expenseKategorien,
    defaultExpenseKategorie,
    projects: allProjects,
    prefillProjectId,
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
  rechnungsdatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Rechnungsdatum erforderlich (YYYY-MM-DD)"),
  abfluss_datum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Abfluss-Datum erforderlich (YYYY-MM-DD)"),
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
  erstattetAm: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

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
      return fail(422, {
        error: "Ungültige Eingabe",
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
        errors: {
          beleg: ["Beleg-Datei ODER eine Begründung ist erforderlich."],
        },
      });
    }

    const year = berlinYear();
    const gate = await checkFestschreibungGate(year);
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
          return fail(422, { error: msg, errors: { beleg: [msg] } });
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

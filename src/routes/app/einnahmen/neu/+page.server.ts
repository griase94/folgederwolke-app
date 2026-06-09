/**
 * /app/einnahmen/neu — freie Einnahme entry form (Phase 5 / Task 3, Tier C2).
 *
 * The simplest of the three create paths: a freie Einnahme → `createIncome`.
 *   - NO bezahlt-von, NO auto-pay, NO member-mail (those are Ausgaben-only).
 *   - Beleg is OPTIONAL (contrast Ausgaben's beleg-or-Begründung): if a file is
 *     attached it's uploaded + its `belegFileId` persisted; if not, the create
 *     still succeeds and NO Begründung is required.
 *   - Sphere is derived server-side INSIDE `createIncome` (spec §4.5, STRICT,
 *     no project override): the action forwards `kategorieNameSnapshot` and lets
 *     the domain layer resolve the kategorie + sphere — a tampered body can't
 *     mis-classify the booking.
 *
 * load(): the income kategorie options + active projects (the optional Projekt
 * field). Route conventions follow spenden/+page.server.ts (fail,
 * locals.session?.user.id, formData→raw).
 */

import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";
import { isoCalendarDate } from "$lib/domain/date.js";
import { errorsFromIssues } from "$lib/domain/zod-errors.js";
import type { Actions, PageServerLoad } from "./$types.js";
import {
  createIncome,
  checkFestschreibungGate,
} from "$lib/server/domain/transactions.js";
import { listKategorieOptions } from "$lib/server/domain/transaction-pickers.js";
import { allocateBusinessId } from "$lib/server/domain/id-allocator.js";
import { handleAuslageUpload } from "$lib/server/files/handleAuslageUpload.js";
import { getDb } from "$lib/server/db/index.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { isNull } from "drizzle-orm";
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
 * The form re-hydration shape — echoed back on a 422 so the entry form keeps
 * what the user typed (Ausgaben/Spenden parity). `betragEur` is the EUROS
 * string the display input binds (cents are derived from it client-side).
 */
export interface EinnahmeFormValues {
  bezeichnung: string;
  betragEur: string;
  geldEingangDatum: string;
  kategorieName: string;
  projectId: string;
  kommentar: string;
}

const EMPTY_VALUES: EinnahmeFormValues = {
  bezeichnung: "",
  betragEur: "",
  geldEingangDatum: "",
  kategorieName: "",
  projectId: "",
  kommentar: "",
};

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------

export const load: PageServerLoad = async ({ url }) => {
  const db = getDb();
  const [incomeKategorien, allProjects] = await Promise.all([
    listKategorieOptions("income"),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(projects.name),
  ]);

  // KategoriePicker expects `{ name, sphere, eurZeile? }`.
  const kategorien = incomeKategorien.map((k) => ({
    name: k.name,
    sphere: k.sphere,
  }));

  // ?projectId= prefill: project detail +Einnahme CTA carries this param so
  // the project picker pre-selects the originating project (C1-PRJ-A §4.3).
  const initialProjectId = url.searchParams.get("projectId") ?? "";

  // A fresh visit seeds the form with empty values (Ausgaben parity); a 422
  // re-hydrate replaces these with the echoed submission via `form.values`.
  return {
    kategorien,
    projects: allProjects,
    initialProjectId,
    values: EMPTY_VALUES,
  };
};

// ---------------------------------------------------------------------------
// Schema — Einnahmen-shaped: NO bezahltVonKind / extern_* fields.
// ---------------------------------------------------------------------------

const incomeSchema = z.object({
  bezeichnung: z.string().min(1).max(500),
  betragCents: z.coerce.number().int().positive(),
  currency: z.string().default("EUR"),
  // The picker drives this; createIncome resolves kategorie + sphere from it.
  kategorieNameSnapshot: z
    .string()
    .min(1)
    .max(200)
    .refine((v) => v !== "(Unkategorisiert)", {
      message: "Kategorie muss ausgewählt werden",
    }),
  // Optional kategorie id (createIncome resolves by NAME — id is not honored).
  kategorieId: z.string().uuid().nullable().optional(),
  // `isoCalendarDate` rejects impossible dates (2026-02-30) as a 422 field
  // error instead of letting them reach a Postgres ::date cast → opaque 500.
  geldEingangDatum: isoCalendarDate.nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  kommentar: z.string().max(2000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// 422 re-hydration helpers (Ausgaben/Spenden parity)
// ---------------------------------------------------------------------------

/** Re-build the form values from the submitted FormData so a 422 re-hydrates. */
function valuesFromForm(data: FormData): EinnahmeFormValues {
  const str = (k: string): string => {
    const v = data.get(k);
    return typeof v === "string" ? v : "";
  };
  const cents = str("betragCents");
  const centsNum = Number(cents);
  return {
    bezeichnung: str("bezeichnung"),
    // Echo the typed euros back (the hidden betragCents mirrors it client-side).
    betragEur: cents && Number.isFinite(centsNum) ? String(centsNum / 100) : "",
    geldEingangDatum: str("geldEingangDatum"),
    kategorieName: str("kategorieNameSnapshot"),
    projectId: str("projectId"),
    kommentar: str("kommentar"),
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
        // Drop the file part — it's handled separately (optional Beleg).
        .filter(([, v]) => !(v instanceof File))
        .map(([k, v]) => [k, v === "" ? null : v]),
    );

    const parsed = incomeSchema.safeParse(raw);
    if (!parsed.success) {
      // Echo the submitted values + per-field errors so the form re-hydrates
      // (Ausgaben/Spenden parity) instead of wiping everything.
      return fail(422, {
        error: "Ungültige Eingabe",
        values: valuesFromForm(data),
        errors: errorsFromIssues(parsed.error.issues),
        issues: parsed.error.issues,
      });
    }

    const year = berlinYear();

    try {
      // Festschreibung gate BEFORE any side-effect (upload / allocate / insert).
      // The new income's year_of_buchung derives from geld_eingang_datum (the
      // cash-in date) per migration 0034, so gate on year(geld_eingang_datum) —
      // NOT the current calendar year. geldEingangDatum is optional;
      // bookingYearFromCashDate falls back to the current Berlin year when null
      // (matching the DB column's COALESCE → year_for_booking(gebucht_am=now())).
      const gateYear = bookingYearFromCashDate(
        parsed.data.geldEingangDatum ?? null,
      );
      const gate = await checkFestschreibungGate(gateYear);
      if (!gate.ok) return fail(gate.status, { error: gate.error });

      // OPTIONAL Beleg: upload only when a non-empty file was attached. No
      // file → belegFileId stays null and the create still succeeds (NO
      // Begründung required — contrast Ausgaben §7.2).
      let belegFileId: string | null = null;
      const belegFormField = data.get("beleg");
      if (belegFormField instanceof File && belegFormField.size > 0) {
        try {
          const uploadResult = await handleAuslageUpload(belegFormField, {
            actorUserId: user.id,
            sourceKind: "app",
          });
          belegFileId = uploadResult.fileId;
        } catch (uploadErr) {
          console.error("[einnahmen/neu] beleg upload failed:", uploadErr);
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

      // `E-` prefix for Einnahmen (ADR-0010). createIncome derives the sphere
      // STRICTLY from the resolved kategorie (no project override, §4.5).
      const businessId = await allocateBusinessId("E", year);
      const result = await createIncome({
        bezeichnung: parsed.data.bezeichnung,
        betragCents: parsed.data.betragCents,
        currency: parsed.data.currency,
        geldEingangDatum: parsed.data.geldEingangDatum ?? null,
        kategorieNameSnapshot: parsed.data.kategorieNameSnapshot,
        kategorieId: parsed.data.kategorieId ?? null,
        projectId: parsed.data.projectId ?? null,
        kommentar: parsed.data.kommentar ?? null,
        belegFileId,
        businessId,
        actorUserId: user.id,
      });

      redirect(303, `/app/einnahmen/${result.id}`);
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
      console.error("[einnahmen/neu/create]", err);
      return fail(500, { error: "Interner Fehler beim Speichern" });
    }
  },
} satisfies Actions;

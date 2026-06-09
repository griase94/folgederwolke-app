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

  return { kategorien, projects: allProjects, initialProjectId };
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
  geldEingangDatum: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  projectId: z.string().uuid().nullable().optional(),
  kommentar: z.string().max(2000).nullable().optional(),
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
        // Drop the file part — it's handled separately (optional Beleg).
        .filter(([, v]) => !(v instanceof File))
        .map(([k, v]) => [k, v === "" ? null : v]),
    );

    const parsed = incomeSchema.safeParse(raw);
    if (!parsed.success) {
      return fail(422, {
        error: "Ungültige Eingabe",
        issues: parsed.error.issues,
      });
    }

    const year = berlinYear();

    try {
      // Festschreibung gate BEFORE any side-effect (upload / allocate / insert).
      const gate = await checkFestschreibungGate(year);
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
          return fail(422, { error: msg, errors: { beleg: [msg] } });
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

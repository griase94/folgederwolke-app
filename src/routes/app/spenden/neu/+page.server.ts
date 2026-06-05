/**
 * /app/spenden/neu — the Spenden entry form (spec §9.2, Phase 6 Task 5).
 *
 * load(): members (with Adresse for the receipt autofill) + projects (optional
 *         Mittelverwendung). NO Kategorie options — the Kategorie is DERIVED
 *         server-side from (Spendenart, Zweckbindung).
 *
 * actions:
 *   ?/create — reads the 3-picker FormData, uploads any optional Beleg /
 *              Herkunftsbeleg to the normalized `files` table, then calls
 *              createSpende (the Task-4 reconciled path that delegates to
 *              createDonation). On !ok → fail(status, {errors, values}); on ok →
 *              redirect(303) to the new detail route.
 */

import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types.js";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "$lib/server/db/index.js";
import { members } from "$lib/server/db/schema/members.js";
import { projects } from "$lib/server/db/schema/projects.js";
import { kategorien } from "$lib/server/db/schema/kategorien.js";
import { createSpende } from "$lib/server/domain/spenden.js";
import { deriveDonationKategorieName } from "$lib/domain/spenden-kategorie.js";
import { handleAuslageUpload } from "$lib/server/files/handleAuslageUpload.js";

// The distinct derived-Kategorie names a Spende can book into (Sachspende
// collapses regardless of Zweckbindung). Used to resolve each one's
// Anlage-Gem-Zeile so the read-only DerivedKategorieBadge can surface it.
const DONATION_KATEGORIE_NAMES = [
  ...new Set([
    deriveDonationKategorieName("geldspende", "zweckfrei"),
    deriveDonationKategorieName("geldspende", "zweckgebunden"),
    deriveDonationKategorieName("sachspende", "zweckfrei"),
    deriveDonationKategorieName("sachspende", "zweckgebunden"),
  ]),
];

export const load: PageServerLoad = async () => {
  const db = getDb();
  const [memberRows, projectRows, katRows] = await Promise.all([
    db
      .select({
        id: members.id,
        vorname: members.vorname,
        nachname: members.nachname,
        adresse: members.adresse,
        email: members.email,
      })
      .from(members)
      .orderBy(members.nachname, members.vorname),
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .orderBy(projects.name),
    // Donations book as `income`-kind Kategorien (createDonation derives via
    // resolveKategorieByName("income", …)); pull their Anlage-Gem-Zeile.
    db
      .select({ name: kategorien.name, zeile: kategorien.anlageGemZeile })
      .from(kategorien)
      .where(
        and(
          eq(kategorien.kind, "income"),
          inArray(kategorien.name, DONATION_KATEGORIE_NAMES),
        ),
      ),
  ]);

  // name → Anlage-Gem-Zeile (null where the Stammdaten mapping is unset; the
  // badge degrades gracefully and omits the Zeile line).
  const anlageGemZeilen: Record<string, number | null> = {};
  for (const r of katRows) anlageGemZeilen[r.name] = r.zeile ?? null;

  return {
    members: memberRows.map((m) => ({
      id: m.id,
      label: `${m.vorname} ${m.nachname}`.trim(),
      adresse: m.adresse ?? null,
      email: m.email ?? null,
    })),
    projects: projectRows.map((p) => ({ id: p.id, name: p.name })),
    anlageGemZeilen,
  };
};

/** Upload an optional Beleg file field → its `files` id, or null when absent. */
async function uploadOptional(
  field: FormDataEntryValue | null,
  actorUserId: string | null,
): Promise<string | null> {
  if (!(field instanceof File) || field.size === 0) return null;
  const { fileId } = await handleAuslageUpload(field, {
    actorUserId: actorUserId ?? undefined,
    sourceKind: "app",
  });
  return fileId;
}

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const data = await request.formData();

    // Optional Beleg uploads → file ids (encouraged, not enforced, §4.3).
    let belegFileId: string | null;
    let herkunftsbelegFileId: string | null;
    try {
      belegFileId = await uploadOptional(data.get("beleg"), userId);
      herkunftsbelegFileId = await uploadOptional(
        data.get("herkunftsbeleg"),
        userId,
      );
    } catch (uploadErr) {
      const msg =
        uploadErr instanceof Error
          ? uploadErr.message
          : "Beleg konnte nicht hochgeladen werden.";
      return fail(422, { error: msg, errors: { beleg: [msg] } });
    }

    // Build the raw payload createSpende validates (snake_case form fields).
    const raw: Record<string, unknown> = {};
    for (const [k, val] of data.entries()) {
      if (k === "beleg" || k === "herkunftsbeleg") continue; // file fields handled above
      raw[k] = val;
    }
    if (belegFileId) raw.beleg_file_id = belegFileId;
    if (herkunftsbelegFileId) raw.herkunftsbeleg_file_id = herkunftsbelegFileId;

    const result = await createSpende(raw, userId);
    if (!result.ok) {
      return fail(result.status, {
        error: result.error,
        errors: result.errors,
        values: result.values ?? raw,
      });
    }

    redirect(303, `/app/spenden/${result.donationId}`);
  },
};

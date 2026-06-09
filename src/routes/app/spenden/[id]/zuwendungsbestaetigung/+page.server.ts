/**
 * /app/spenden/[id]/zuwendungsbestaetigung
 *
 * (Phase 6 / Tier C3: MOVED here from /app/transactions/[id]/… — logic
 * unchanged; reuses allocateBescheinigung/extractBmfPflichtfelder from
 * spenden.ts + the BescheinigungsPreview component.)
 *
 * load(): returns Spende + BMF Pflichtfelder preview. Refuses to load if
 *         Bescheinigung is disabled in env (per masterplan §2.2 + §9) so
 *         the UI can render a clear error.
 *
 * actions:
 *   ?/generate  - allocates B-{YYYY}-{NNN}, persists it, emits event.
 *                 Returns redirect=`?download=1` so the next load() streams
 *                 the PDF immediately.
 *
 * The actual PDF download is handled by a sibling /pdf endpoint
 * (./pdf/+server.ts) returning a streamed application/pdf response.
 */

import { error, fail } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { donations } from "$lib/server/db/schema/donations.js";
import {
  allocateBescheinigung,
  betragInWorten,
  extractBmfPflichtfelder,
  isBescheinigungEnabled,
} from "$lib/server/domain/spenden.js";
import { env } from "$lib/server/env.js";
import { readStammdaten } from "$lib/server/domain/settings-stammdaten.js";
import { addressLines } from "$lib/server/domain/address.js";

export const load: PageServerLoad = async ({ params }) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(donations)
    .where(eq(donations.id, params.id))
    .limit(1);
  const sp = rows[0];
  if (!sp) throw error(404, "Spende nicht gefunden");

  const enabled = isBescheinigungEnabled();

  // Build a *preview* Pflichtfelder bundle even if not yet bescheinigt.
  // If the row already has a bescheinigung_nr we surface those values;
  // otherwise we render placeholders to let the admin sanity-check before
  // hitting "Bescheinigung ausstellen".
  let preview: Awaited<ReturnType<typeof previewPflichtfelder>> | null = null;
  let alreadyIssued = false;
  let extractError: string | null = null;

  if (sp.bescheinigungNr) {
    alreadyIssued = true;
    try {
      preview = await extractBmfPflichtfelder(sp);
    } catch (e) {
      extractError = (e as Error).message;
    }
  } else {
    preview = await previewPflichtfelder(sp);
  }

  return {
    spende: {
      id: sp.id,
      businessId: sp.businessId,
      zugewendetAm: sp.zugewendetAm,
      betragCents: Number(sp.betragCents),
      currency: sp.currency,
      spendeKind: sp.spendeKind,
      spenderName: sp.spenderName,
      spenderAdresse: sp.spenderAdresse,
      bescheinigungNr: sp.bescheinigungNr,
      bescheinigungAusgestelltAm: sp.bescheinigungAusgestelltAm,
      festgeschriebenAt: sp.festgeschriebenAt
        ? sp.festgeschriebenAt.toISOString()
        : null,
    },
    bescheinigungEnabled: enabled,
    alreadyIssued,
    preview: preview
      ? {
          ...preview,
          // serialise bigint betragCents safely
          betragCents: Number(preview.betragCents),
        }
      : null,
    extractError,
  };
};

async function previewPflichtfelder(sp: typeof donations.$inferSelect) {
  const sacheBeschreibung =
    sp.spendeKind === "sachspende"
      ? ((sp.zweckbindungText?.includes("Sache:")
          ? (sp.zweckbindungText.split("Sache:")[1]?.trim() ?? null)
          : sp.zweckbindungText) ?? null)
      : null;
  // White-label: Stammdaten preview mirrors the issued cert — settings-sourced
  // name/address/Steuernummer/VR, env-sourced Finanzamt + Bescheid config.
  const sd = await readStammdaten();
  return {
    vereinName: sd.name,
    vereinSteuernummer: sd.steuernummer,
    vereinVr: sd.vr,
    // Normalize to real newlines so the preview renders stacked (whitespace-pre-line);
    // the issued PDF normalizes internally via addressLines/maskOrtFromAdresse.
    vereinAdresse: addressLines(sd.adresse).join("\n"),
    vereinFinanzamt: env.VEREIN_FINANZAMT,
    bescheidTyp: env.VEREIN_BESCHEID_TYP || "-",
    bescheidDatum: env.VEREIN_BESCHEID_DATUM || "-",
    satzungsFassung: env.VEREIN_SATZUNG_FASSUNG || null,
    freistellungsbescheidVz: env.VEREIN_FREISTELLUNGSBESCHEID_VZ || null,
    steuerbegueZwecke: env.VEREIN_STEUERBEGUENSTIGTE_ZWECKE,
    spenderName: sp.spenderName ?? "",
    spenderAdresse: sp.spenderAdresse ?? "",
    spendeDatum: sp.zugewendetAm ?? "-",
    betragCents: sp.betragCents,
    betragInWorten: betragInWorten(sp.betragCents),
    spendeKind: sp.spendeKind === "sachspende" ? "sachspende" : "geldspende",
    sacheBeschreibung,
    zweckbindungKind: sp.zweckbindungKind,
    zweckbindungText:
      sp.zweckbindungKind === "zweckgebunden" ? sp.zweckbindungText : null,
    bescheinigungNr: sp.bescheinigungNr ?? "(noch nicht vergeben)",
    ausgestelltAm:
      sp.bescheinigungAusgestelltAm ?? new Date().toISOString().slice(0, 10),
  };
}

export const actions: Actions = {
  generate: async ({ params, locals }) => {
    const userId = locals.session?.user.id ?? null;
    const result = await allocateBescheinigung(params.id, userId);
    if (!result.ok) {
      return fail(result.status, {
        action: "generate",
        error: result.error,
      });
    }
    return {
      action: "generate",
      success: true,
      bescheinigungNr: result.bescheinigungNr,
    };
  },
};

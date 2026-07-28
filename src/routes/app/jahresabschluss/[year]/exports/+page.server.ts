/**
 * /app/jahresabschluss/[year]/exports — the download hub (D-Flow §2.5).
 *
 * The heavy workspace payload (year, closed, spendenCount, preFlight …) comes
 * from the [year]/+layout.server.ts. This tab load only adds the ZIP-bundle
 * MANIFEST, rendered verbatim from the single-source `bundleManifest` so the
 * screen can never advertise a filename the ZIP doesn't contain (§4.5).
 */

import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";
import { bundleManifest } from "$lib/server/eur/bundle-manifest.js";
import {
  isYearClosed,
  readFestschreibungMeta,
} from "$lib/server/domain/jahresabschluss.js";

export const load: PageServerLoad = async ({ params }) => {
  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    throw error(400, `Ungültiges Jahr: ${params.year}`);
  }
  // festgeschrieben am · durch wen — only meaningful once the year is sealed.
  const festMeta = (await isYearClosed(year))
    ? await readFestschreibungMeta(year)
    : null;
  return { manifest: bundleManifest(year), festMeta };
};

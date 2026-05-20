/**
 * GET /app/jahresabschluss/[year]/eur.pdf  — C1-H4 / C1 cycle 3 NEW-1
 *
 * Single-purpose EÜR PDF endpoint, separate from the Steuerberater-Paket
 * bundle.zip. The Quick-Action "PDF drucken (EÜR)" button on the Übersicht
 * tab points here so users get just the one-pager without waiting for the
 * full ZIP build.
 *
 * Cycle 3: delegates to the shared `loadEurAggregatesForPdf(year)` so the
 * PDF and the workspace Übersicht share the same 3-source union (income +
 * donations + member_beitrags). Single source of truth.
 */

import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { loadEurAggregatesForPdf } from "$lib/server/eur/load.js";
import { generateEurPdf } from "$lib/server/export/eur-pdf.js";

export const GET: RequestHandler = async ({ params }) => {
  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    throw error(400, `Ungültiges Jahr: ${params.year}`);
  }

  const { eur, vereinName } = await loadEurAggregatesForPdf(year);
  const pdfBytes = await generateEurPdf(eur, vereinName);

  const filename = `EÜR-${year}.pdf`;
  return new Response(pdfBytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBytes.length),
      "Cache-Control": "no-store",
    },
  });
};

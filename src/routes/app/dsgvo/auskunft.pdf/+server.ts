/**
 * POST /app/dsgvo/auskunft.pdf
 *
 * Accepts { email } as form data, collects Auskunft data, renders PDF,
 * and returns it as an inline/attachment response. This dedicated endpoint
 * allows the browser to trigger a real file download (the page action
 * returns JSON for the preview pane; this route returns raw bytes).
 *
 * Requires authenticated admin session (enforced by /app layout guard).
 */

import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { collectAuskunft } from "$lib/server/domain/dsgvo.js";
import { renderAuskunftPdf } from "$lib/server/pdf/auskunft.js";

export const POST: RequestHandler = async ({ request }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString().trim() ?? "";

  if (!email || !email.includes("@")) {
    throw error(400, "Bitte eine gültige E-Mail-Adresse angeben.");
  }

  let data;
  try {
    data = await collectAuskunft(email);
  } catch (err) {
    console.error("[dsgvo/auskunft.pdf] collectAuskunft error:", err);
    throw error(500, "Fehler beim Sammeln der Daten.");
  }

  let pdf;
  try {
    pdf = await renderAuskunftPdf(data);
  } catch (err) {
    console.error("[dsgvo/auskunft.pdf] renderAuskunftPdf error:", err);
    throw error(500, "Fehler beim Generieren des PDF.");
  }

  return new Response(pdf.bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.suggestedFilename}"`,
      "Content-Length": String(pdf.bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
};

/**
 * POST /api/rechnungen/preview — render the real Rechnung PDF for the
 * live-preview pane on /app/rechnungen/new.
 *
 * Phase 11. Renderer is pure (`renderRechnungV2` via pdfLibInvoiceRenderer);
 * fonts + assets are memoized in module scope so warm renders are ~50-70ms.
 *
 * Hardening:
 *   - session-gated (locals.session.user) — leaks Verein bank details + the
 *     in-flight Rechnungsnummer otherwise
 *   - Zod-validated draft schema with explicit upper bounds on string lengths
 *     and nettoCents to bound CPU/memory under abuse
 *   - response is application/pdf with `Cache-Control: no-store` — every
 *     keystroke produces fresh bytes, no edge/CDN caching desired
 *
 * The schema is intentionally LOOSER than `createInvoiceSchema` — partial
 * drafts must render: empty strings, missing customer, zero amount all OK.
 * Validation gates submission, not preview.
 */

import { error, json } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { RequestHandler } from "./$types.js";
import { getDb } from "$lib/server/db/index.js";
import { idCounters } from "$lib/server/db/schema/id_counters.js";
import { and, eq } from "drizzle-orm";
import { berlinYear } from "$lib/domain/year.js";
import { env } from "$lib/server/env.js";
import { readStammdaten } from "$lib/server/domain/settings-stammdaten.js";
import { pdfLibInvoiceRenderer } from "$lib/server/pdf/pdf-lib-renderer.js";

// Bounded draft schema — anything the renderer can survive is allowed, but
// string lengths and netto cents are capped to bound work under abuse.
const previewSchema = z.object({
  customerName: z.string().max(500).optional().default(""),
  customerAddressBlock: z.string().max(2000).nullable().optional().default(""),
  customerCountry: z
    .string()
    .max(8)
    .regex(/^[A-Za-z]{0,3}$/, "country must be 2-3 letter code or empty")
    .optional()
    .default("DE"),
  // Dates: accept the YYYY-MM-DD shape OR empty string (pre-hydration the
  // form's $state defaults are `""` and the first reactive refresh fires
  // before the parent's hydration $effect propagates `data.today`). Empty
  // is then passed through to the renderer which falls back to today.
  rechnungsdatum: z
    .string()
    .max(20)
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "must be YYYY-MM-DD or empty")
    .optional(),
  leistungsDatum: z
    .string()
    .max(20)
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .nullable()
    .optional(),
  faelligkeitsDatum: z
    .string()
    .max(20)
    .regex(/^(\d{4}-\d{2}-\d{2})?$/)
    .nullable()
    .optional(),
  // leistungszeitraum + leistungsBeschreibung: form sends `null` when the
  // input is empty (parent `_ || null`), so both must accept null in addition
  // to a string.
  leistungszeitraum: z.string().max(500).nullable().optional().default(""),
  bezeichnung: z.string().max(2000).optional().default(""),
  leistungsBeschreibung: z.string().max(4000).nullable().optional().default(""),
  // 100 million euros — way above any real Rechnung, low enough that
  // string formatting + page allocation stays bounded.
  nettoCents: z.number().int().min(0).max(10_000_000_00).optional().default(0),
  currency: z
    .string()
    .max(3)
    .regex(/^[A-Z]{3}$/)
    .optional()
    .default("EUR"),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.session?.user) {
    throw error(401, "Nicht authentifiziert");
  }

  let payload: z.infer<typeof previewSchema>;
  try {
    const body = (await request.json()) as unknown;
    payload = previewSchema.parse(body);
  } catch (err) {
    return json(
      {
        error: "invalid_payload",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  // Compute a fresh preview business id — does NOT bump the counter; the
  // real allocation happens inside createInvoice() on form submit.
  const db = getDb();
  const year = berlinYear();
  const counterRows = await db
    .select({ nextValue: idCounters.nextValue })
    .from(idCounters)
    .where(and(eq(idCounters.kind, "FDW"), eq(idCounters.year, year)))
    .limit(1);
  const nextSeq = counterRows[0] ? Number(counterRows[0].nextValue) : 1;
  const invoiceNumberPreview = `FDW-${year}-${String(nextSeq).padStart(3, "0")}`;

  // Load settings (verein.iban/bic/bank/kassenwaert_name) — same pathway as
  // loadRenderInput so the preview is byte-for-byte identical to the saved
  // PDF for the same input.
  const settingsRows = await db.execute<{ key: string; value: unknown }>(
    sql`SELECT key, value FROM settings WHERE key IN ('verein.iban', 'verein.bic', 'verein.bank', 'verein.kassenwaert_name')`,
  );
  const settingsMap = new Map<string, string>();
  for (const r of settingsRows as { key: string; value: unknown }[]) {
    const v = r.value;
    if (typeof v === "string") settingsMap.set(r.key, v);
    else if (v !== null && v !== undefined) settingsMap.set(r.key, String(v));
  }
  const unquote = (s: string): string => s.replace(/^"|"$/g, "");

  // White-label: name + address come from the single settings→env Stammdaten
  // reader (no hardcoded FdW literals).
  const sd = await readStammdaten();
  const kassenwaertName =
    unquote(settingsMap.get("verein.kassenwaert_name") ?? "") ||
    "Julia Schwarz";

  const nettoCents = payload.nettoCents;
  const ustCents = 0;
  const bruttoCents = nettoCents + ustCents;

  // Fall back gracefully when fields are empty so the renderer always has a
  // valid template to draw — preview is never a validation gate.
  const bezeichnung = payload.bezeichnung.trim() || "Bezeichnung";
  const customerName = payload.customerName.trim() || "Kund:in";

  // Treat empty-string dates as missing — the form's $state defaults are
  // "" before parent hydration, and the renderer wants real ISO strings.
  const today = new Date().toISOString().slice(0, 10);
  const { bytes } = await pdfLibInvoiceRenderer.render({
    invoiceNumber: invoiceNumberPreview,
    rechnungsdatum: payload.rechnungsdatum || today,
    leistungsDatum: payload.leistungsDatum || null,
    faelligkeitsDatum: payload.faelligkeitsDatum || null,
    leistungszeitraum: payload.leistungszeitraum?.trim() || null,
    verein: {
      name: sd.name,
      adresse: sd.adresse,
      steuernummer: sd.steuernummer,
      vereinsregister: sd.vr,
      iban:
        unquote(settingsMap.get("verein.iban") ?? "") || env.VEREIN_IBAN || "",
      bic: unquote(settingsMap.get("verein.bic") ?? "") || env.VEREIN_BIC || "",
      bank:
        unquote(settingsMap.get("verein.bank") ?? "") || env.VEREIN_BANK || "",
      contactEmail: env.MAIL_FROM || "",
    },
    customer: {
      name: customerName,
      addressBlock: payload.customerAddressBlock ?? null,
      country: payload.customerCountry || "DE",
    },
    bezeichnung,
    leistungsBeschreibung: payload.leistungsBeschreibung ?? null,
    lineItems: [
      {
        beschreibung:
          payload.leistungsBeschreibung && payload.leistungsBeschreibung.trim()
            ? payload.leistungsBeschreibung
            : bezeichnung,
        nettoCents,
      },
    ],
    nettoCents,
    ustCents,
    bruttoCents,
    currency: payload.currency,
    footerNote:
      "Kein Ausweis der Umsatzsteuer gemaess Paragraph 19 UStG (Kleinunternehmerregelung). " +
      "Vielen Dank fuer die gute Zusammenarbeit.",
    kassenwaertName,
  });

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="Rechnung-Vorschau.pdf"',
      "cache-control": "no-store",
      "x-preview-business-id": invoiceNumberPreview,
    },
  });
};

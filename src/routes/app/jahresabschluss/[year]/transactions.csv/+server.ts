/**
 * GET /app/jahresabschluss/[year]/transactions.csv  — C1-H4
 *
 * Per-year flat CSV of all Buchungen (income + expense + donation), the
 * same data that powers the Buchungsliste tab. Quick-Action "CSV
 * exportieren" on the Übersicht tab points here.
 *
 * Format: UTF-8 with BOM, semicolon-delimited (Excel DE-locale defaults).
 */

import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { listTransactions } from "$lib/server/domain/transactions.js";
// NOTE: `csvCell` here is the GUARDED shared primitive — output is
// byte-identical to this route's old inline copy EXCEPT injection-trigger
// cells are now neutralized (a leading `'` is prepended to fields starting
// with `= + - @ \t \r`). This is intentional CSV-injection hardening; no
// external consumer pins the old bytes pre-launch. KIND_LABEL/SPHERE_LABEL are
// shared from transactions-csv.ts so the labels live in exactly one place.
import { BOM, csvCell, formatCents } from "$lib/server/export/csv-util.js";
import {
  KIND_LABEL,
  SPHERE_LABEL,
} from "$lib/server/export/transactions-csv.js";

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(";");
}

export const GET: RequestHandler = async ({ params }) => {
  const year = parseInt(params.year, 10);
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    throw error(400, `Ungültiges Jahr: ${params.year}`);
  }

  // Match Buchungsliste loader's limit so the CSV mirrors what the user
  // sees in the table. Bounded at 2000 — typical Verein years are well
  // under that.
  const { rows } = await listTransactions({ year, limit: 2000 });

  const lines: string[] = [];

  // BOM for Excel DE-locale auto-detect
  lines.push(
    BOM +
      csvRow([
        "Datum",
        "Buchung-Nr",
        "Bezeichnung",
        "Art",
        "Sphäre (Snapshot)",
        "Sphäre (Effektiv)",
        "Kategorie",
        "Betrag (EUR)",
        "Betrag (Cent)",
        "Währung",
        "Festgeschrieben am",
      ]),
  );

  for (const r of rows) {
    lines.push(
      csvRow([
        // Datum = cash-relevant date (relevanz_datum) the row booked under
        // (migration 0034). listTransactions threads it as COALESCE(<cash>,
        // Berlin gebucht_am date) — always a bare YYYY-MM-DD inside
        // [year-01-01, year-12-31]. `?? gebuchtAm` is a defensive belt only.
        r.relevanzDatum ?? r.gebuchtAm,
        r.businessId,
        r.bezeichnung,
        KIND_LABEL[r.kind] ?? r.kind,
        SPHERE_LABEL[r.sphereSnapshot] ?? r.sphereSnapshot,
        SPHERE_LABEL[r.sphereEffective] ?? r.sphereEffective,
        r.kategorieNameSnapshot,
        formatCents(r.betragCents),
        String(r.betragCents),
        r.currency,
        r.festgeschriebenAt ?? "",
      ]),
    );
  }

  const csv = lines.join("\r\n") + "\r\n";

  const filename = `Buchungen-${year}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};

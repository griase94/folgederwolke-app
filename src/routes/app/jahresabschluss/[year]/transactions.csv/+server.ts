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

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[;"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(";");
}

/** Format integer cents as German-locale "12,34" string. */
function formatCents(cents: number): string {
  const euros = (cents / 100).toFixed(2);
  return euros.replace(".", ",");
}

const KIND_LABEL: Record<string, string> = {
  income: "Einnahme",
  expense: "Ausgabe",
  donation: "Spende",
};

const SPHERE_LABEL: Record<string, string> = {
  ideeller: "Ideeller Bereich",
  vermoegen: "Vermögensverwaltung",
  zweckbetrieb: "Zweckbetrieb",
  wirtschaftlich: "Wirtschaftlicher Geschäftsbetrieb",
};

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
    "﻿" +
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
        r.gebuchtAm,
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

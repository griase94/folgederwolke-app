/**
 * Per-tab CSV builder for the Transactions export (Phase 8).
 *
 * Pure function — no DB, no HTTP. The output is byte-identical to the
 * jahresabschluss oracle route for the same data.
 *
 * Usage:
 *   const csv = buildTransactionsCsv(rows, 'ausgaben');
 *   return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', ... } });
 */

import { BOM, csvCell, formatCents } from "$lib/server/export/csv-util.js";
import type {
  AusgabenRow,
  EinnahmenRow,
  SpendenRow,
} from "$lib/server/domain/transactions.js";

// ---------------------------------------------------------------------------
// Label maps (match the oracle exactly)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Standard 11-column header (all three tabs)
// ---------------------------------------------------------------------------

const HEADER_COLS = [
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
] as const;

// ---------------------------------------------------------------------------
// buildTransactionsCsv
// ---------------------------------------------------------------------------

/**
 * Build a semicolon-delimited, UTF-8-with-BOM CSV string for one tab.
 *
 * - Lines are CRLF-terminated (including the last line), matching the oracle.
 * - Spenden get a 12th column `Bescheinigung`.
 * - `betragCents` is unsigned; direction is carried by the `Art` column.
 */
export function buildTransactionsCsv(
  rows: AusgabenRow[] | EinnahmenRow[] | SpendenRow[],
  tab: "ausgaben" | "einnahmen" | "spenden",
): string {
  const isSpenden = tab === "spenden";

  const headerCols: string[] = [...HEADER_COLS];
  if (isSpenden) headerCols.push("Bescheinigung");

  const lines: string[] = [];

  // BOM prepended to the first line (header), matching the oracle.
  lines.push(BOM + headerCols.map(csvCell).join(";"));

  for (const r of rows) {
    const sphereSnapshot = SPHERE_LABEL[r.sphereSnapshot] ?? r.sphereSnapshot;

    // Sphäre (Effektiv): for Ausgaben, use sphereOverride if present;
    // for Einnahmen/Spenden effective == snapshot. The per-tab row types
    // don't expose sphereOverride directly — AusgabenRow carries only
    // sphereSnapshot in BaseTxRow (override plumbing added in a later task).
    // For now, fall back to sphereSnapshot for all three tabs.
    const sphereEffective = sphereSnapshot;

    const rowCells: Array<string | number | null | undefined> = [
      r.gebuchtAm,
      r.businessId,
      r.bezeichnung,
      KIND_LABEL[r.kind] ?? r.kind,
      sphereSnapshot,
      sphereEffective,
      r.kategorieNameSnapshot,
      formatCents(r.betragCents),
      String(r.betragCents),
      r.currency,
      r.festgeschriebenAt ?? "",
    ];

    if (isSpenden) {
      const spRow = r as SpendenRow;
      rowCells.push(spRow.bescheinigungNr ?? "ausstehend");
    }

    lines.push(rowCells.map(csvCell).join(";"));
  }

  // Oracle: `lines.join('\r\n') + '\r\n'` — trailing CRLF always present.
  return lines.join("\r\n") + "\r\n";
}

/**
 * Per-tab CSV builder for the Transactions export (Phase 8).
 *
 * Pure function — no DB, no HTTP. The output matches the jahresabschluss
 * oracle route for the same data, byte-identical EXCEPT that injection-trigger
 * cells are now neutralized (intentional CSV-injection hardening via the shared
 * `csvCell`; no external consumer pre-launch).
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
// Label maps — single source of truth (the oracle route imports these).
// ---------------------------------------------------------------------------

export const KIND_LABEL: Record<string, string> = {
  income: "Einnahme",
  expense: "Ausgabe",
  donation: "Spende",
};

export const SPHERE_LABEL: Record<string, string> = {
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

    // Sphäre (Effektiv): for Ausgaben, use sphereEffective (= sphereOverride ??
    // sphereSnapshot, already resolved by listAusgabenPage). For Einnahmen/Spenden
    // the effective sphere == the snapshot (no override column), so we fall back to
    // sphereSnapshot when the row doesn't carry a sphereEffective field.
    const sphereEffective =
      "sphereEffective" in r
        ? (SPHERE_LABEL[(r as { sphereEffective: string }).sphereEffective] ??
          (r as { sphereEffective: string }).sphereEffective)
        : sphereSnapshot;

    const rowCells: Array<string | number | null | undefined> = [
      // GoBD/EÜR Datum = the cash-relevant date (= relevanz_datum) the row was
      // booked under (migration 0034). Falls back to gebucht_am when no cash
      // date is set. Keeps the Datum inside the cash-year window the export
      // filtered on.
      r.relevanzDatum ?? r.gebuchtAm,
      r.businessId,
      r.bezeichnung,
      KIND_LABEL[r.kind] ?? r.kind,
      sphereSnapshot,
      sphereEffective,
      r.kategorieNameSnapshot,
      // Betrag: `betragCents` is UNSIGNED in all three row projections (the
      // `Art` column carries expense/income direction), so the leading-`-`
      // injection guard in csvCell never fires on these numeric cells.
      formatCents(r.betragCents),
      // Pass the raw number — csvCell stringifies internally (no double-String).
      r.betragCents,
      r.currency,
      r.festgeschriebenAt ?? "",
    ];

    // Invariant: tab === 'spenden' ⟺ rows are SpendenRow, which is the only
    // projection carrying `bescheinigungNr`. The `in` guard makes that
    // explicit (and narrows the union) instead of an unchecked cast.
    if (isSpenden && "bescheinigungNr" in r) {
      rowCells.push(r.bescheinigungNr ?? "ausstehend");
    }

    lines.push(rowCells.map(csvCell).join(";"));
  }

  // Oracle: `lines.join('\r\n') + '\r\n'` — trailing CRLF always present.
  return lines.join("\r\n") + "\r\n";
}

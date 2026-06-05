/**
 * Ausgaben column definitions — Phase 4, Task 2 (spec §7.1 / §13).
 *
 * The shared `TransactionListScaffold` is GENERIC over `Row extends BaseTxRow`;
 * the Ausgaben row is `AusgabenRow` (carries `status` / `bezahltVonDisplay` /
 * `erstattetAm` / `belegFileId` / `approvedAt`). We declare
 * `ColumnDef<AusgabenRow>[]` so each column's `render` snippet reads those
 * per-tab fields DIRECTLY — no `row as AusgabenRow` cast anywhere.
 *
 * Render snippets must be created in a Svelte component context, so this module
 * exports a FACTORY: `+page.svelte` defines the cell snippets (Datum, ID,
 * Bezeichnung+Bezahlt-von subtitle, Bezahlt-von, Kategorie, the Sphäre LEFT
 * COLOR-RULE — render snippet, NOT a filled badge per §13 —, Betrag right via
 * Money, Status badge, chevron) and passes them here; this module owns the
 * column metadata (key / German label / sortable / align) + ordering so the
 * header sort keys + alignment live in one place.
 *
 * The sort `key`s match the Ausgaben sort whitelist the Phase-2 `listAusgabenPage`
 * ORDER BY understands (`gebuchtAm`, `businessId`, `bezeichnung`, `betrag`,
 * `status`); non-sortable columns (Bezahlt-von, Kategorie, Sphäre, Beleg,
 * chevron) omit `sortable`.
 */

import type { Snippet } from "svelte";
import type { ColumnDef } from "../TransactionListScaffold.svelte";
import type { AusgabenRow } from "$lib/server/domain/transactions.js";

/** The per-cell render snippets the `+page.svelte` supplies (one per column). */
export interface AusgabenCellSnippets {
  datum: Snippet<[AusgabenRow]>;
  id: Snippet<[AusgabenRow]>;
  bezeichnung: Snippet<[AusgabenRow]>;
  bezahltVon: Snippet<[AusgabenRow]>;
  kategorie: Snippet<[AusgabenRow]>;
  /** §13: a left COLOR-RULE keyed on sphere — not a filled badge. */
  sphaere: Snippet<[AusgabenRow]>;
  betrag: Snippet<[AusgabenRow]>;
  status: Snippet<[AusgabenRow]>;
  chevron: Snippet<[AusgabenRow]>;
}

/**
 * Build the Ausgaben `ColumnDef<AusgabenRow>[]` from the page's cell snippets.
 * Column metadata (key / label / sortable / align) lives here; the markup lives
 * in the snippets the caller passes.
 */
export function ausgabenColumns(
  cells: AusgabenCellSnippets,
): ColumnDef<AusgabenRow>[] {
  return [
    // Sphäre LEFT color-rule (§13) — leads the row as a thin tone bar, not a
    // filled badge. Not sortable (a visual rule, not a data axis).
    { key: "sphaere", label: "", render: cells.sphaere },
    { key: "gebuchtAm", label: "Datum", sortable: true, render: cells.datum },
    { key: "businessId", label: "ID", sortable: true, render: cells.id },
    {
      key: "bezeichnung",
      label: "Bezeichnung",
      sortable: true,
      render: cells.bezeichnung,
    },
    { key: "bezahltVon", label: "Bezahlt von", render: cells.bezahltVon },
    { key: "kategorie", label: "Kategorie", render: cells.kategorie },
    {
      key: "betrag",
      label: "Betrag",
      align: "right",
      sortable: true,
      render: cells.betrag,
    },
    { key: "status", label: "Status", sortable: true, render: cells.status },
    { key: "chevron", label: "", align: "right", render: cells.chevron },
  ];
}

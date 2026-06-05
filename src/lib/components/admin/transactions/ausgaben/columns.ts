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
 * Sorting is currently DISABLED on every column: the shared `listAusgabenPage`
 * hardcodes its ORDER BY, so a `sortable: true` header would be clickable but
 * dead (emit `?sort=` the query ignores). The sort `key`s are retained on the
 * descriptive columns so re-enabling is a one-line flip once the shared sort
 * plumbing lands — see the per-column TODO below.
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
  // TODO re-enable once shared listAusgabenPage sort plumbing lands (Tier-C
  // shared-kit batch): flip `sortable: false` → `true` on the keyed columns
  // below (gebuchtAm / businessId / bezeichnung / betrag / status). Until then
  // every header is inert so we don't ship clickable-but-dead sort controls.
  return [
    // Sphäre LEFT color-rule (§13) — leads the row as a thin tone bar, not a
    // filled badge. Not sortable (a visual rule, not a data axis).
    { key: "sphaere", label: "", render: cells.sphaere },
    { key: "gebuchtAm", label: "Datum", sortable: false, render: cells.datum },
    { key: "businessId", label: "ID", sortable: false, render: cells.id },
    {
      key: "bezeichnung",
      label: "Bezeichnung",
      sortable: false,
      render: cells.bezeichnung,
    },
    { key: "bezahltVon", label: "Bezahlt von", render: cells.bezahltVon },
    { key: "kategorie", label: "Kategorie", render: cells.kategorie },
    {
      key: "betrag",
      label: "Betrag",
      align: "right",
      sortable: false,
      render: cells.betrag,
    },
    { key: "status", label: "Status", sortable: false, render: cells.status },
    { key: "chevron", label: "", align: "right", render: cells.chevron },
  ];
}

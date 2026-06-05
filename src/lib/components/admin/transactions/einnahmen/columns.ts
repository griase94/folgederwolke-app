/**
 * Einnahmen list columns — Phase 5 / Task 2 (Tier C2, spec §8.1 + §13).
 *
 * Column order: Datum (Geldeingang) · ID (mono, E-prefixed businessId) ·
 * Bezeichnung (+ 🔗 Rechnung badge) · Kategorie · Sphäre (left color-rule) ·
 * Betrag (right, Money). NO status column, NO bulk checkbox — Einnahmen has no
 * status / open-erstattung workflow.
 *
 * `ColumnDef.render` is a Svelte `Snippet`, so the per-cell render bodies are
 * authored in `+page.svelte` and injected via this factory — keeping the
 * column METADATA (keys/labels/sortable/align) co-located + type-checked
 * against `EinnahmenRow` while the markup lives where snippets are legal.
 *
 * The row type is `EinnahmenRow` (extends BaseTxRow, carries
 * `rechnungBusinessId`), so the 🔗 cell reads `row.rechnungBusinessId`
 * directly — no casts (the scaffold's `ColumnDef` is generic over the row).
 */
import type { Snippet } from "svelte";
import type { ColumnDef } from "../TransactionListScaffold.svelte";
import type { EinnahmenRow } from "$lib/server/domain/transactions.js";

/** The per-cell render snippets the route supplies (each takes one row). */
export interface EinnahmenCellSnippets {
  datum: Snippet<[EinnahmenRow]>;
  id: Snippet<[EinnahmenRow]>;
  bezeichnung: Snippet<[EinnahmenRow]>;
  kategorie: Snippet<[EinnahmenRow]>;
  sphaere: Snippet<[EinnahmenRow]>;
  betrag: Snippet<[EinnahmenRow]>;
}

/**
 * Build the Einnahmen `ColumnDef<EinnahmenRow>[]` from the route-supplied cell
 * snippets.
 *
 * TODO(sort): all columns are `sortable: false` for now — `listEinnahmenPage`
 * hardcodes `ORDER BY gebuchtAm DESC` and ignores `?sort=`, so a clickable
 * header would be a dead control (navigates `?sort=` but the result set never
 * reorders). Re-enable `sortable: true` on Datum / Bezeichnung / Betrag once
 * the shared server-side sort plumbing (Phase-2/scaffold) honors `?sort=&dir=`.
 */
export function buildEinnahmenColumns(
  cells: EinnahmenCellSnippets,
): ColumnDef<EinnahmenRow>[] {
  return [
    { key: "gebuchtAm", label: "Datum", render: cells.datum },
    { key: "businessId", label: "ID", render: cells.id },
    {
      key: "bezeichnung",
      label: "Bezeichnung",
      render: cells.bezeichnung,
    },
    { key: "kategorie", label: "Kategorie", render: cells.kategorie },
    { key: "sphaere", label: "Sphäre", render: cells.sphaere },
    {
      key: "betrag",
      label: "Betrag",
      align: "right",
      render: cells.betrag,
    },
  ];
}

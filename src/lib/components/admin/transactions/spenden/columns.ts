/**
 * Spenden list columns (spec §9.1, Phase 6 Task 2).
 *
 * The shared `TransactionListScaffold` + `ColumnDef` are GENERIC over the row
 * type. The Spenden row is `SpendenRow` (extends `BaseTxRow`; carries
 * `spenderName`, `spendeKind`, `zweckbindungKind`, `bescheinigungNr`), so we
 * declare `ColumnDef<SpendenRow>[]` and read those fields directly — no casts.
 *
 * Column set (§9.1): Datum · ID (mono) · Spender · Art (Spendenart badge) ·
 * Zweckbindung · Betrag (right, Money) · Bescheinigung (B-Nummer, else a quiet
 * "ausstehend"). NO Status column; NO Sphäre rule (Spenden are always ideeller —
 * a constant, so a per-row sphere cell would be noise).
 *
 * The cell MARKUP lives in the `+page.svelte` `{#snippet}` blocks (auto-escaped
 * Svelte markup + the `Money` component + chevron), wired in here via this
 * factory so the column structure + the `SpendenRow` typing stay in one place.
 */

import type { Snippet } from "svelte";
import type { ColumnDef } from "../TransactionListScaffold.svelte";
import type { SpendenRow } from "$lib/server/domain/transactions.js";

/** The per-column render snippets the Spenden `+page.svelte` supplies. */
export interface SpendenColumnSnippets {
  datum: Snippet<[SpendenRow]>;
  id: Snippet<[SpendenRow]>;
  spender: Snippet<[SpendenRow]>;
  art: Snippet<[SpendenRow]>;
  zweckbindung: Snippet<[SpendenRow]>;
  betrag: Snippet<[SpendenRow]>;
  bescheinigung: Snippet<[SpendenRow]>;
}

/** Build the typed Spenden `ColumnDef<SpendenRow>[]` from the cell snippets. */
export function spendenColumns(
  s: SpendenColumnSnippets,
): ColumnDef<SpendenRow>[] {
  // NOTE: every column is `sortable: false` (omitted) for now. listSpendenPage
  // hardcodes `ORDER BY donations.gebucht_am DESC` and ignores the scaffold's
  // `?sort=`/`?dir=` params, so a clickable header would be a dead control (it
  // navigates + reloads but the order never changes). The shared server-side
  // sort plumbing lands in a later phase.
  // TODO(phase: shared-sort): re-enable `sortable: true` on Datum / Spender /
  // Betrag once listSpendenPage honours the `?sort`/`?dir` query params.
  return [
    { key: "gebuchtAm", label: "Datum", render: s.datum },
    { key: "businessId", label: "ID", render: s.id },
    { key: "spenderName", label: "Spender", render: s.spender },
    { key: "spendeKind", label: "Art", render: s.art },
    { key: "zweckbindungKind", label: "Zweckbindung", render: s.zweckbindung },
    { key: "betrag", label: "Betrag", align: "right", render: s.betrag },
    { key: "bescheinigungNr", label: "Bescheinigung", render: s.bescheinigung },
  ];
}

/** German label for a Spendenart enum value. */
export function spendeArtLabel(kind: string): string {
  if (kind === "sachspende") return "Sachspende";
  if (kind === "aufwandsspende") return "Aufwandsspende";
  return "Geldspende";
}

/** German label for a Zweckbindung enum value. */
export function zweckbindungLabel(kind: string): string {
  return kind === "zweckgebunden" ? "zweckgebunden" : "zweckfrei";
}

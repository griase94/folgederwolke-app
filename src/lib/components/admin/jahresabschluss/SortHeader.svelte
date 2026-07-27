<!--
	SortHeader — the sticky, sortable long-list column header for the
	Buchungsliste (D-Flow §2.3). The kit .colhead is only a label row; a long
	list needs an interactive STICKY head: clicking a column flips the sort, a
	caret shows the direction, and aria-sort carries the truth for screen
	readers. Link-based (query-param SSR): each sortable column is an <a> to the
	next sort state, so it works without JS. Num/date columns sit right-aligned
	on the SAME ruler as the rows (`--cols` matches the ledger grid).
-->
<script lang="ts" module>
  import { cn } from "$lib/utils.js";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";

  export type SortDir = "asc" | "desc";

  export interface SortColumn {
    key: string;
    label: string;
    /** false = a static, non-clickable label (no caret). */
    sortable?: boolean;
    /** right-aligned numeric/date column. */
    num?: boolean;
  }

  export interface SortHeaderProps {
    columns: SortColumn[];
    /** grid-template-columns — must match the ledger rows underneath. */
    cols: string;
    activeKey?: string;
    activeDir?: SortDir;
    /** URL for clicking a column into (key, dir) — SSR-friendly. */
    hrefFor: (key: string, dir: SortDir) => string;
    class?: string;
    "data-testid"?: string;
  }
</script>

<script lang="ts">
  let {
    columns,
    cols,
    activeKey,
    activeDir = "desc",
    hrefFor,
    class: className,
    "data-testid": testId = "sort-header",
  }: SortHeaderProps = $props();

  // Clicking the active column flips its direction; a fresh column starts desc.
  const nextDir = (key: string): SortDir =>
    key === activeKey && activeDir === "desc" ? "asc" : "desc";
</script>

<div
  class={cn("sorthead", className)}
  style={`--cols: ${cols}`}
  data-testid={testId}
  data-slot="sort-header"
  role="row"
>
  {#each columns as col (col.key)}
    {#if col.sortable === false}
      <span class="sortcol static" class:is-num={col.num} role="columnheader"
        >{col.label}</span
      >
    {:else}
      <!-- eslint-disable svelte/no-navigation-without-resolve -- in-app sort query link -->
      <a
        class="sortcol"
        class:is-num={col.num}
        href={hrefFor(col.key, nextDir(col.key))}
        role="columnheader"
        aria-sort={col.key === activeKey
          ? activeDir === "asc"
            ? "ascending"
            : "descending"
          : "none"}
      >
        {col.label}
        <ChevronDown
          class="sc-caret {col.key === activeKey && activeDir === 'asc'
            ? 'is-asc'
            : ''}"
          aria-hidden="true"
        />
      </a>
      <!-- eslint-enable svelte/no-navigation-without-resolve -->
    {/if}
  {/each}
</div>

<style>
  .sorthead {
    position: sticky;
    top: 0;
    z-index: 3;
    display: grid;
    grid-template-columns: var(--cols);
    align-items: center;
    gap: 14px;
    padding: 10px 16px;
    background: var(--card);
    border-bottom: 1px solid var(--border);
  }
  .sortcol {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 2px 0;
    margin: 0;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-500);
    white-space: nowrap;
    text-decoration: none;
    border-radius: 5px;
    transition: color 0.12s;
  }
  a.sortcol {
    cursor: pointer;
  }
  .sortcol.is-num {
    justify-content: flex-end;
  }
  a.sortcol:hover {
    color: var(--ink-700);
  }
  a.sortcol:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--ring);
  }
  .sortcol :global(.sc-caret) {
    width: 13px;
    height: 13px;
    flex: none;
    opacity: 0;
    transition:
      transform 0.12s,
      opacity 0.12s;
  }
  a.sortcol:hover :global(.sc-caret) {
    opacity: 0.45;
  }
  /* active sort — strong ink + a full, rotated caret. */
  .sortcol[aria-sort="ascending"],
  .sortcol[aria-sort="descending"] {
    color: var(--ink-900);
  }
  .sortcol[aria-sort="ascending"] :global(.sc-caret),
  .sortcol[aria-sort="descending"] :global(.sc-caret) {
    opacity: 1;
  }
  .sortcol :global(.sc-caret.is-asc) {
    transform: rotate(180deg);
  }
</style>

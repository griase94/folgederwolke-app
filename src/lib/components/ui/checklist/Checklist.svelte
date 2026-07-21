<!--
	Checklist — a Pflichtangaben precondition list (Buchen §2.5
	Zuwendungsbestätigung). Each row is either a satisfied precondition (green
	check) or a missing one (red warn icon + Klartext + source link). A missing
	row is NEVER neutral-grey: red = blocker (ANDY-LENS §4). The fix link
	(`fixHref`) points exactly where the gap is closed. Purely read-only; the
	server stays the source of truth (it independently refuses an incomplete
	issue) — this list is the honest client-side preview of that gate.
-->
<script lang="ts" module>
  import { cn } from "$lib/utils.js";
  import Check from "@lucide/svelte/icons/check";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  export interface ChecklistRow {
    /** Satisfied? false renders the red `.miss` blocker row. */
    ok: boolean;
    label: string;
    /** Secondary line — the concrete value, or why it's missing. */
    sub?: string;
    /** When missing: link to where the gap is closed. */
    fixHref?: string;
    /** Fix-link label (a "›" chevron is appended). Default "Eintragen". */
    fixLabel?: string;
  }

  export interface ChecklistProps {
    items: ChecklistRow[];
    class?: string;
    "data-testid"?: string;
  }
</script>

<script lang="ts">
  let {
    items,
    class: className,
    "data-testid": testId = "checklist",
  }: ChecklistProps = $props();
</script>

<div class={cn("checklist", className)} data-testid={testId} data-slot="checklist">
  {#each items as row (row.label)}
    <div class="ck-item" class:ok={row.ok} class:miss={!row.ok}>
      <span class="ck-ic">
        {#if row.ok}
          <Check class="size-3.5" aria-hidden="true" />
        {:else}
          <TriangleAlert class="size-3.5" aria-hidden="true" />
        {/if}
      </span>
      <div class="ck-body">
        <span class="ck-label">{row.label}</span>
        {#if row.sub}<span class="ck-sub">{row.sub}</span>{/if}
      </div>
      {#if !row.ok && row.fixHref}
        <a class="ck-fix" href={row.fixHref}>{row.fixLabel ?? "Eintragen"} ›</a>
      {/if}
    </div>
  {/each}
</div>

<style>
  .checklist {
    display: flex;
    flex-direction: column;
  }
  .ck-item {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: start;
    gap: 11px;
    padding: 10px 2px;
  }
  .ck-item + .ck-item {
    border-top: 1px solid var(--hairline);
  }
  .ck-ic {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: none;
    margin-top: 1px;
  }
  /* ok = confirmed (Einnahme green tint); miss = blocker (critical), never grey. */
  .ck-item.ok .ck-ic {
    background: var(--type-einnahme-tint);
    color: var(--type-einnahme);
  }
  .ck-item.miss .ck-ic {
    background: color-mix(in srgb, var(--sev-critical) 14%, transparent);
    color: var(--sev-critical-text);
  }
  .ck-body {
    min-width: 0;
  }
  .ck-label {
    display: block;
    font-size: 13.5px;
    font-weight: 550;
    color: var(--ink-900);
    line-height: 1.35;
  }
  .ck-item.miss .ck-label {
    color: var(--sev-critical-text);
    font-weight: 650;
  }
  .ck-sub {
    display: block;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--ink-500);
    margin-top: 2px;
    line-height: 1.4;
  }
  .ck-fix {
    align-self: center;
    font-size: 12px;
    font-weight: 650;
    color: var(--primary-text);
    text-decoration: none;
    white-space: nowrap;
  }
  .ck-fix:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .ck-fix:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
    border-radius: 4px;
  }
</style>

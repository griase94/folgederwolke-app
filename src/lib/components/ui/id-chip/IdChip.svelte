<!--
	IdChip — a compact, tabular identifier chip (B-JJJJ-NNN, AUS-JJJJ-NNNN,
	R-JJJJ-NNN). The Kennung is a FACT, never a state: it is toned neutrally,
	never in a status colour. Digits are tabular and the token never wraps
	mid-number. `pending` = not yet assigned (dashed, muted) — render the
	placeholder ("B-2026-###"), never a fake number. Optional leading icon
	sits in ink-500 (kit ext id-chip.css).
-->
<script lang="ts" module>
  import { cn } from "$lib/utils.js";
  import type { Snippet } from "svelte";

  export interface IdChipProps {
    /** The identifier to show. For `pending`, pass the placeholder. */
    value: string;
    /** Not-yet-assigned styling (dashed, muted). */
    pending?: boolean;
    /** Optional leading icon snippet (rendered in ink-500). */
    icon?: Snippet;
    class?: string;
    "data-testid"?: string;
  }
</script>

<script lang="ts">
  let {
    value,
    pending = false,
    icon,
    class: className,
    "data-testid": testId = "id-chip",
  }: IdChipProps = $props();
</script>

<span
  class={cn("id-chip", className)}
  class:pending
  data-testid={testId}
  data-slot="id-chip"
>
  {#if icon}<span class="id-chip-ic">{@render icon()}</span>{/if}
  {value}
</span>

<style>
  /* The Kennung is a fact, not a status — neutral tone, never a status colour.
     Tabular digits, never wraps mid-token (kit ext id-chip.css). */
  .id-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--secondary);
    border: 1px solid var(--border);
    color: var(--ink-700);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .id-chip-ic {
    display: inline-flex;
    width: 13px;
    height: 13px;
    color: var(--ink-500);
  }
  .id-chip-ic :global(svg) {
    width: 13px;
    height: 13px;
  }
  .id-chip.pending {
    background: transparent;
    border-style: dashed;
    color: var(--ink-500);
    font-weight: 600;
  }
</style>

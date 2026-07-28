<!--
	GobdTrustBlock — the sober GoBD integrity reassurance shared by the
	Jahresabschluss export screens (ja-exports + gobd-export, D-Flow §1). States
	a fact, never an action: the export is anchored with a SHA checksum in the
	hash-chained audit_log (ADR-0004 / ADR-0012). Trust/legal copy stays sober
	(T18c) — no marketing. `stacked` is the narrow-rail variant (kit-ext
	gobd-stacked.css): the SHA-Kette meta drops under the text.
-->
<script lang="ts" module>
  import { cn } from "$lib/utils.js";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import Check from "@lucide/svelte/icons/check";

  export interface GobdTrustBlockProps {
    title?: string;
    sub?: string;
    /** SHA-Kette integrity meta (right column / stacked row). */
    integKey?: string;
    integMeta?: string;
    /** Narrow-rail variant — meta stacks under the text. */
    stacked?: boolean;
    class?: string;
    "data-testid"?: string;
  }
</script>

<script lang="ts">
  let {
    title = "GoBD-sicher dokumentiert",
    sub = "Der Export wird mit SHA-Prüfsumme im Audit-Log verankert — unveränderbar und prüfbar.",
    integKey = "SHA-256-Kette",
    integMeta = "hash-verkettet",
    stacked = false,
    class: className,
    "data-testid": testId = "gobd-trust-block",
  }: GobdTrustBlockProps = $props();
</script>

<div
  class={cn("gobd", className)}
  class:is-stacked={stacked}
  data-testid={testId}
  data-slot="gobd-trust-block"
>
  <span class="lk">
    <ShieldCheck class="size-[18px]" aria-hidden="true" />
  </span>
  <div class="rt">
    <div class="k">{title}</div>
    <div class="s">{sub}</div>
  </div>
  {#if integKey}
    <div class="integ">
      <span class="ik">
        <Check class="size-3" aria-hidden="true" />{integKey}
      </span>
      {#if integMeta}<span class="im">{integMeta}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .gobd {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--ink-500) 6%, var(--card));
    border: 1px solid var(--border);
  }
  .lk {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--ink-500) 10%, var(--card));
    color: var(--ink-700);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .rt {
    flex: 1;
    min-width: 0;
  }
  .rt .k {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--ink-900);
  }
  .rt .s {
    font-size: 12px;
    color: var(--ink-500);
    margin-top: 2px;
    line-height: 1.45;
  }
  .integ {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-end;
    padding-left: 16px;
    border-left: 1px solid var(--border);
  }
  .integ .ik {
    font-size: 11.5px;
    font-weight: 700;
    color: var(--sev-info);
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .integ .im {
    font-size: 10.5px;
    color: var(--ink-500);
  }
  /* Narrow-rail variant — meta stacks under the text (kit-ext gobd-stacked). */
  .gobd.is-stacked {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .gobd.is-stacked .rt {
    flex: 1 1 0;
  }
  .gobd.is-stacked .integ {
    flex: 1 1 100%;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    margin-left: 52px;
    margin-top: 10px;
    padding-left: 0;
    padding-top: 10px;
    border-left: 0;
    border-top: 1px solid var(--border);
  }
</style>

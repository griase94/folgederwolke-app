<!--
	ReadinessCard — the Abschluss-Bereitschaft rail card on the EÜR Übersicht
	(D-Flow §2.2). Summarises whether the year can be closed: a head (title +
	passed/total count), an ok/warn callout ("2025 ist abschlussbereit." vs the
	remaining blocker), the pre-flight checklist (shared PreFlightList), and a
	link into the Hub where the actual Festschreibung happens. The close button
	itself lives ONLY at the Hub (D1a) — this card only points there.
-->
<script lang="ts" module>
  import { cn } from "$lib/utils.js";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import PreFlightList, {
    type PreFlightListItem,
  } from "./PreFlightList.svelte";

  export interface ReadinessCardProps {
    title?: string;
    passedCount: number;
    totalCount: number;
    callout: { tone: "ok" | "warn"; title: string; sub?: string };
    items: PreFlightListItem[];
    linkHref?: string;
    linkLabel?: string;
    class?: string;
    "data-testid"?: string;
  }
</script>

<script lang="ts">
  let {
    title = "Abschluss-Bereitschaft",
    passedCount,
    totalCount,
    callout,
    items,
    linkHref,
    linkLabel = "Zum Jahresabschluss",
    class: className,
    "data-testid": testId = "readiness-card",
  }: ReadinessCardProps = $props();
</script>

<div
  class={cn("ready-card", className)}
  data-testid={testId}
  data-slot="readiness-card"
>
  <div class="ready-head">
    <h3 class="ready-title">{title}</h3>
    <span class="ready-count">{passedCount} / {totalCount} ✓</span>
  </div>

  <div class="rc-callout {callout.tone}">
    <span class="rc-tile">
      {#if callout.tone === "ok"}
        <CircleCheck class="size-4" aria-hidden="true" />
      {:else}
        <TriangleAlert class="size-4" aria-hidden="true" />
      {/if}
    </span>
    <div class="rc-body">
      <div class="rc-at">{callout.title}</div>
      {#if callout.sub}<div class="rc-as">{callout.sub}</div>{/if}
    </div>
  </div>

  <PreFlightList {items} />

  {#if linkHref}
    <!-- eslint-disable svelte/no-navigation-without-resolve -- in-app Hub link -->
    <a class="ready-link" href={linkHref}>
      {linkLabel}<ArrowRight class="size-[15px]" aria-hidden="true" />
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {/if}
</div>

<style>
  .ready-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow-card);
    padding: 18px 20px;
  }
  .ready-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }
  .ready-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--ink-900);
  }
  .ready-count {
    font-size: 12px;
    font-weight: 700;
    color: var(--type-einnahme);
    font-variant-numeric: tabular-nums;
  }
  .rc-callout {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 11px 13px;
    border-radius: 10px;
    border: 1px solid;
    margin-bottom: 12px;
  }
  .rc-callout.ok {
    border-color: color-mix(in srgb, var(--type-einnahme) 30%, transparent);
    background: color-mix(in srgb, var(--type-einnahme) 9%, transparent);
  }
  .rc-callout.warn {
    border-color: color-mix(in srgb, var(--sev-warn) 35%, transparent);
    background: color-mix(in srgb, var(--sev-warn) 12%, transparent);
  }
  .rc-tile {
    flex: none;
    margin-top: 1px;
  }
  .rc-callout.ok .rc-tile {
    color: var(--type-einnahme);
  }
  .rc-callout.warn .rc-tile {
    color: var(--sev-warn-text);
  }
  .rc-at {
    font-size: 13px;
    font-weight: 700;
    color: var(--ink-900);
    line-height: 1.35;
  }
  .rc-as {
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--ink-700);
  }
  .ready-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 14px;
    font-size: 13px;
    font-weight: 700;
    color: var(--primary-text);
    text-decoration: none;
  }
  .ready-link:hover {
    text-decoration: underline;
    text-underline-offset: 2px;
  }
</style>

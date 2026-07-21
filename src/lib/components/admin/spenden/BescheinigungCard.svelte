<!--
	BescheinigungCard — the Ausstellungs-Rail card for the Zuwendungsbestätigung
	(Buchen §2.5). A complete, state-driven shell: status head (with the id-chip
	Kennung), an optional callout, the compact Spende .facts, the Pflichtangaben
	.checklist, a consequence microcopy + the page-provided CTA form, and the
	GoBD trust line. The page derives which props to pass per state
	(ready / config-missing / issued / error / festgeschrieben / loading); the
	form wiring (?/generate, download) stays in the page via the `cta` snippet.

	The status-head + facts + id-chip are the parts reused as the Rail-Kurzform
	in the spende detail (S4) — same card, compact composition.
-->
<script lang="ts" module>
  import { cn } from "$lib/utils.js";
  import type { Snippet } from "svelte";
  import {
    FactsTable,
    type FactRow,
  } from "$lib/components/ui/facts-table/index.js";
  import {
    Checklist,
    type ChecklistRow,
  } from "$lib/components/ui/checklist/index.js";
  import { IdChip } from "$lib/components/ui/id-chip/index.js";
  import GobdBlock from "$lib/components/admin/transactions/detail/GobdBlock.svelte";
  import FileCheck from "@lucide/svelte/icons/file-check";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import Loader from "@lucide/svelte/icons/loader-circle";
  import Info from "@lucide/svelte/icons/info";
  import Check from "@lucide/svelte/icons/check";

  export type BescheinigungStatusTone = "neutral" | "warn" | "ok" | "loading";
  export type CalloutTone = "info" | "warn" | "crit" | "ok";

  export interface BescheinigungCardCallout {
    tone: CalloutTone;
    title: string;
    body?: string;
  }

  export interface BescheinigungCardProps {
    status: { tone: BescheinigungStatusTone; title: string; sub?: string };
    /** The Kennung: issued number, or the pending placeholder. */
    idChip?: { value: string; pending?: boolean; issued?: boolean };
    callout?: BescheinigungCardCallout;
    facts?: FactRow[];
    factsEyebrow?: string;
    checklist?: ChecklistRow[];
    checklistEyebrow?: string;
    /** Info microcopy shown above the CTA (or the lock note in issued state). */
    consequence?: Snippet;
    /** The page-owned action area (the ?/generate form, or the PDF download). */
    cta?: Snippet;
    /** Show the GoBD audit-anchor trust line. */
    gobd?: boolean;
    /** Skeleton body while the preview is loading. */
    loading?: boolean;
    class?: string;
    "data-testid"?: string;
  }
</script>

<script lang="ts">
  let {
    status,
    idChip,
    callout,
    facts,
    factsEyebrow = "Spende",
    checklist,
    checklistEyebrow = "Pflichtangaben",
    consequence,
    cta,
    gobd = false,
    loading = false,
    class: className,
    "data-testid": testId = "bescheinigung-card",
  }: BescheinigungCardProps = $props();
</script>

<div
  class={cn("rail-card", className)}
  data-testid={testId}
  data-slot="bescheinigung-card"
>
  <div class="rc-statushead" data-tone={status.tone}>
    <span class="rsh-ic">
      {#if status.tone === "ok"}
        <ShieldCheck class="size-5" aria-hidden="true" />
      {:else if status.tone === "warn"}
        <TriangleAlert class="size-5" aria-hidden="true" />
      {:else if status.tone === "loading"}
        <Loader class="size-5 animate-spin" aria-hidden="true" />
      {:else}
        <FileCheck class="size-5" aria-hidden="true" />
      {/if}
    </span>
    <div class="rsh-text">
      <div class="rsh-t">{status.title}</div>
      {#if status.sub}<div class="rsh-s">{status.sub}</div>{/if}
    </div>
    {#if idChip}
      <span class="rsh-chip">
        <IdChip value={idChip.value} pending={idChip.pending}>
          {#snippet icon()}
            {#if idChip.issued}<FileCheck
                class="size-3.5"
                aria-hidden="true"
              />{/if}
          {/snippet}
        </IdChip>
      </span>
    {/if}
  </div>

  {#if loading}
    <div class="rc-sec">
      <div class="flex flex-col gap-3" aria-hidden="true">
        <div class="skl" style="width: 60%; height: 15px"></div>
        <div class="skl" style="width: 100%"></div>
        <div class="skl" style="width: 92%"></div>
        <div class="skl" style="width: 78%"></div>
        <div
          class="skl"
          style="margin-top: 6px; width: 100%; height: 44px"
        ></div>
      </div>
    </div>
  {:else}
    {#if callout}
      <div class="rc-sec">
        <div class="callout callout-{callout.tone}">
          <span class="callout-ic">
            {#if callout.tone === "ok"}
              <Check class="size-4" aria-hidden="true" />
            {:else if callout.tone === "info"}
              <Info class="size-4" aria-hidden="true" />
            {:else}
              <TriangleAlert class="size-4" aria-hidden="true" />
            {/if}
          </span>
          <div class="callout-body">
            <div class="callout-title">{callout.title}</div>
            {#if callout.body}<div class="callout-sub">{callout.body}</div>{/if}
          </div>
        </div>
      </div>
    {/if}

    {#if facts && facts.length > 0}
      <div class="rc-sec">
        <span class="rc-eyebrow">{factsEyebrow}</span>
        <FactsTable rows={facts} labelWidth="128px" />
      </div>
    {/if}

    {#if checklist && checklist.length > 0}
      <div class="rc-sec">
        <span class="rc-eyebrow">{checklistEyebrow}</span>
        <Checklist items={checklist} />
      </div>
    {/if}

    {#if consequence || cta}
      <div class="rc-sec rc-cta">
        {#if consequence}<div class="consequence">
            {@render consequence()}
          </div>{/if}
        {@render cta?.()}
      </div>
    {/if}

    {#if gobd}
      <div class="rc-sec">
        <GobdBlock documented={false} />
      </div>
    {/if}
  {/if}
</div>

<style>
  .rail-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    box-shadow: var(--shadow-card);
    overflow: hidden;
  }
  .rc-sec {
    padding: 16px 18px;
  }
  .rc-sec + .rc-sec {
    border-top: 1px solid var(--hairline);
  }
  .rc-eyebrow {
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-500);
    margin-bottom: 12px;
  }
  .rc-statushead {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 18px;
    background: var(--secondary);
  }
  .rsh-ic {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    flex: none;
    background: var(--type-spende-tint);
    color: var(--type-spende);
  }
  .rc-statushead[data-tone="ok"] {
    background: var(--type-einnahme-tint);
  }
  .rc-statushead[data-tone="ok"] .rsh-ic {
    background: color-mix(in srgb, var(--type-einnahme) 16%, var(--card));
    color: var(--type-einnahme);
  }
  .rc-statushead[data-tone="warn"] {
    background: color-mix(in srgb, var(--sev-warn) 12%, var(--card));
  }
  .rc-statushead[data-tone="warn"] .rsh-ic {
    background: color-mix(in srgb, var(--sev-warn) 16%, var(--card));
    color: var(--sev-warn-text);
  }
  .rsh-text {
    min-width: 0;
  }
  .rsh-t {
    font-size: 14px;
    font-weight: 700;
    color: var(--ink-900);
  }
  .rsh-s {
    font-size: 12px;
    color: var(--ink-500);
    margin-top: 2px;
  }
  .rsh-chip {
    margin-left: auto;
  }
  .consequence {
    display: flex;
    gap: 9px;
    align-items: flex-start;
    font-size: 12px;
    line-height: 1.5;
    color: var(--ink-700);
    margin-bottom: 14px;
  }
  .consequence:last-child {
    margin-bottom: 0;
  }
  /* Callout — the crit/ok/info/warn treatment the public InlineAlert can't cover. */
  .callout {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid;
    font-size: 12.5px;
  }
  .callout-ic {
    flex: none;
    margin-top: 1px;
  }
  .callout-title {
    font-weight: 700;
    color: var(--ink-900);
    line-height: 1.35;
  }
  .callout-sub {
    margin-top: 3px;
    color: var(--ink-700);
    line-height: 1.5;
  }
  .callout-info {
    border-color: color-mix(in srgb, var(--sev-info) 30%, transparent);
    background: color-mix(in srgb, var(--sev-info) 10%, transparent);
  }
  .callout-info .callout-ic {
    color: var(--sev-info);
  }
  .callout-warn {
    border-color: color-mix(in srgb, var(--sev-warn) 35%, transparent);
    background: color-mix(in srgb, var(--sev-warn) 12%, transparent);
  }
  .callout-warn .callout-ic {
    color: var(--sev-warn-text);
  }
  .callout-crit {
    border-color: color-mix(in srgb, var(--sev-critical) 35%, transparent);
    background: color-mix(in srgb, var(--sev-critical) 10%, transparent);
  }
  .callout-crit .callout-ic {
    color: var(--sev-critical-text);
  }
  .callout-crit .callout-title {
    color: var(--sev-critical-text);
  }
  .callout-ok {
    border-color: color-mix(in srgb, var(--type-einnahme) 30%, transparent);
    background: color-mix(in srgb, var(--type-einnahme) 10%, transparent);
  }
  .callout-ok .callout-ic {
    color: var(--type-einnahme);
  }
  .skl {
    height: 13px;
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      var(--secondary) 0%,
      color-mix(in srgb, var(--secondary) 60%, var(--card)) 50%,
      var(--secondary) 100%
    );
  }
</style>

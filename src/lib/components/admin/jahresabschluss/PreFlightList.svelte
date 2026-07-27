<!--
	PreFlightList — the Jahresabschluss pre-flight checklist (shared by YearCard
	+ ReadinessCard). Three-state items: pass (green ✓), warn (amber, receipts
	can arrive later), block (red, must resolve before close). A missing/blocking
	item is NEVER neutral-grey — block = red (ANDY-LENS §4). The fix link points
	exactly where the gap is closed.
-->
<script lang="ts" module>
  import { cn } from "$lib/utils.js";
  import Check from "@lucide/svelte/icons/check";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";

  export type PreFlightStatus = "pass" | "warn" | "block";

  export interface PreFlightListItem {
    id: string;
    label: string;
    status: PreFlightStatus;
    detail?: string;
    fixHref?: string;
    fixLabel?: string;
  }

  export interface PreFlightListProps {
    items: PreFlightListItem[];
    class?: string;
    "data-testid"?: string;
  }
</script>

<script lang="ts">
  let {
    items,
    class: className,
    "data-testid": testId = "preflight-list",
  }: PreFlightListProps = $props();
</script>

<div
  class={cn("checklist", className)}
  data-testid={testId}
  data-slot="preflight-list"
>
  {#each items as item (item.id)}
    <div class="ck-item {item.status}">
      <span class="ck-ic">
        {#if item.status === "pass"}
          <Check class="size-3.5" aria-hidden="true" />
        {:else if item.status === "warn"}
          <TriangleAlert class="size-3.5" aria-hidden="true" />
        {:else}
          <CircleAlert class="size-3.5" aria-hidden="true" />
        {/if}
      </span>
      <div class="ck-body">
        <span class="ck-label">{item.label}</span>
        {#if item.detail}<span class="ck-sub">{item.detail}</span>{/if}
      </div>
      {#if item.status !== "pass" && item.fixHref}
        <!-- eslint-disable svelte/no-navigation-without-resolve -- in-app fix path -->
        <a class="ck-fix" href={item.fixHref}>{item.fixLabel ?? "Beheben"} ›</a>
        <!-- eslint-enable svelte/no-navigation-without-resolve -->
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
    padding: 9px 2px;
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
  .ck-item.pass .ck-ic {
    background: var(--type-einnahme-tint);
    color: var(--type-einnahme);
  }
  .ck-item.warn .ck-ic {
    background: color-mix(in srgb, var(--sev-warn) 16%, transparent);
    color: var(--sev-warn-text);
  }
  .ck-item.block .ck-ic {
    background: color-mix(in srgb, var(--sev-critical) 14%, transparent);
    color: var(--sev-critical-text);
  }
  .ck-label {
    display: block;
    font-size: 13px;
    font-weight: 550;
    color: var(--ink-900);
    line-height: 1.35;
  }
  .ck-item.block .ck-label {
    color: var(--sev-critical-text);
    font-weight: 650;
  }
  .ck-sub {
    display: block;
    font-size: 11.5px;
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
</style>

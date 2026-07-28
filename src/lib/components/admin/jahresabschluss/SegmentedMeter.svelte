<!--
	SegmentedMeter — a slim stacked-segment status bar + legend (D-Flow §2.4,
	ja-spenden Status-Meter). Each segment's width is proportional to its count;
	tiny segments keep a min-width so they never vanish.

	GOTCHA (locked): the `open` tone maps to `--neutral-open`, NOT `--st-open`
	(which is `--sev-warn` in the app tokens). "merely open / ausstehend" is a
	neutral state, never an amber warning — amber is reserved for true overdue
	(`over`). See aurora.css --st-open comment + ANDY-LENS §4.
-->
<script lang="ts" module>
  import { cn } from "$lib/utils.js";

  export type SegmentTone = "ok" | "open" | "neutral" | "over" | "exempt";

  export interface MeterSegment {
    tone: SegmentTone;
    count: number;
    label: string;
  }

  export interface SegmentedMeterProps {
    segments: MeterSegment[];
    /** Render the legend row below the bar. */
    legend?: boolean;
    class?: string;
    "data-testid"?: string;
  }
</script>

<script lang="ts">
  let {
    segments,
    legend = true,
    class: className,
    "data-testid": testId = "segmented-meter",
  }: SegmentedMeterProps = $props();

  const shown = $derived(segments.filter((s) => s.count > 0));
</script>

<div
  class={cn("sm-wrap", className)}
  data-testid={testId}
  data-slot="segmented-meter"
>
  <div
    class="meter"
    role="img"
    aria-label={segments.map((s) => `${s.count} ${s.label}`).join(", ")}
  >
    {#each shown as seg (seg.tone + seg.label)}
      <span class="mseg {seg.tone}" style={`flex: ${seg.count}`}></span>
    {/each}
  </div>
  {#if legend}
    <div class="legend">
      {#each segments as seg (seg.tone + seg.label)}
        <span class="lg">
          <span class="dot {seg.tone}"></span>{seg.count}
          {seg.label}
        </span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .meter {
    display: flex;
    height: 10px;
    border-radius: 5px;
    overflow: hidden;
    background: var(--secondary);
    gap: 1px;
  }
  .mseg {
    height: 100%;
    min-width: 3px;
  }
  /* Tone → colour. `open` = --neutral-open (NEVER sev-warn — that's `over`). */
  .mseg.ok {
    background: var(--type-einnahme);
  }
  .mseg.open {
    background: var(--neutral-open);
  }
  .mseg.over {
    background: var(--sev-warn);
  }
  .mseg.neutral {
    background: color-mix(in srgb, var(--ink-500) 32%, var(--card));
  }
  .mseg.exempt {
    background: var(--type-vermoegen, var(--ink-500));
    background-image: repeating-linear-gradient(
      45deg,
      rgb(255 255 255 / 0.34) 0 2px,
      transparent 2px 5px
    );
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 11px;
  }
  .lg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-500);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 3px;
    flex: none;
  }
  .dot.ok {
    background: var(--type-einnahme);
  }
  .dot.open {
    background: var(--neutral-open);
  }
  .dot.over {
    background: var(--sev-warn);
  }
  .dot.neutral {
    background: color-mix(in srgb, var(--ink-500) 32%, var(--card));
  }
  .dot.exempt {
    background: var(--type-vermoegen, var(--ink-500));
    background-image: repeating-linear-gradient(
      45deg,
      rgb(255 255 255 / 0.5) 0 1.5px,
      transparent 1.5px 4px
    );
  }
</style>

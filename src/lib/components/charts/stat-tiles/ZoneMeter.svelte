<script lang="ts" module>
	export interface ZoneMeterProps {
		/** Current value, integer cents. */
		valueCents: number;
		/** Cap / limit, integer cents (e.g. 50.000 € Freigrenze). */
		capCents: number;
		/** Warn threshold as a fraction of the cap (default 0.8). */
		threshold?: number;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * Linear zone meter (dataviz §6 stat-tiles freigrenze) — one ratio on a
	 * green→amber→red track with a threshold tick and a hard cap. The fill turns
	 * amber near the limit and red once over it. Restates the §64 gauge compactly.
	 */
	import { TOKEN } from "../_shared/tokens.js";
	import { clamp } from "../_shared/geometry.js";
	import { eurWhole } from "../_shared/format.js";

	let { valueCents, capCents, threshold = 0.8, class: className }: ZoneMeterProps = $props();

	const frac = $derived(capCents > 0 ? valueCents / capCents : 0);
	const usedPct = $derived(clamp(frac * 100, 0, 100));
	const threshPct = $derived(threshold * 100);
	const state = $derived(valueCents >= capCents ? "over" : frac >= threshold ? "warn" : "safe");
	const fillColor = $derived(
		state === "over" ? TOKEN.over : state === "warn" ? TOKEN.warn : TOKEN.einnahme,
	);
</script>

<div
	data-slot="zone-meter"
	data-testid="zone-meter"
	class={className}
	role="img"
	aria-label={`${Math.round(frac * 100)} Prozent der Grenze genutzt, ${eurWhole(valueCents)} von ${eurWhole(capCents)}`}
>
	<div class="relative h-3">
		<div class="absolute inset-x-0 inset-y-px overflow-hidden rounded-md" style:background-color={TOKEN.ringTrack}>
			<div class="absolute inset-y-0 right-0" style:width={`${100 - threshPct}%`} style:background-color={state === "over" ? TOKEN.overTint : TOKEN.warnTint}></div>
			<div class="absolute inset-y-0 left-0 rounded-md" style:width={`${usedPct}%`} style:background-color={fillColor}></div>
		</div>
		<div class="absolute inset-y-[-3px] w-0.5 rounded-sm" style:left={`${threshPct}%`} style:background-color={TOKEN.warn}></div>
		<div class="absolute inset-y-[-3px] right-0 w-0.5 rounded-sm" style:background-color={TOKEN.ink700}></div>
	</div>
	<div class="relative mt-1.5 h-[15px] text-[10px] font-semibold text-ink-500">
		<span class="absolute left-0">0 €</span>
		<!-- drop the threshold % label near the right edge so it can't collide with the cap label -->
		{#if threshPct <= 70}
			<span class="absolute -translate-x-full font-bold" style:left={`${threshPct}%`} style:color={TOKEN.warnText}>{Math.round(threshold * 100)} %</span>
		{/if}
		<span class="absolute right-0 font-bold text-ink-700">{eurWhole(capCents)}</span>
	</div>
</div>

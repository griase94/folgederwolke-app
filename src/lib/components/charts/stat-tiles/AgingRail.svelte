<script lang="ts" module>
	export interface AgingRailProps {
		/** Age of the oldest open item, in days. */
		daysOld: number;
		/** Payment deadline (Frist), in days. */
		fristDays: number;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * Age-banded rail (dataviz §6 stat-tiles-v8 "offene Forderungen") — a
	 * proportional schiene showing how far the oldest open item has aged against
	 * its Frist. Amber up to the Frist, red past it; a tick marks the Frist and a
	 * dot marks the oldest item. Every number is printed — no hover.
	 */
	import { TOKEN } from "../_shared/tokens.js";
	import { clamp } from "../_shared/geometry.js";

	let { daysOld, fristDays, class: className }: AgingRailProps = $props();

	const scaleMax = $derived(Math.max(fristDays * 1.5, daysOld + 6));
	const fristPct = $derived(clamp((fristDays / scaleMax) * 100, 0, 100));
	const daysPct = $derived(clamp((daysOld / scaleMax) * 100, 0, 100));
	const overdue = $derived(daysOld > fristDays);
	const over = $derived(Math.max(0, daysOld - fristDays));
	// In a narrow tile the Frist + älteste labels collide → merge them into one
	// right-aligned label (dataviz §5 robust-at-scale, mirrors the plate).
	const mergeLabels = $derived(fristPct > 55 || daysPct - fristPct < 22);
</script>

<div
	data-slot="aging-rail"
	data-testid="aging-rail"
	class={className}
	role="img"
	aria-label={`Älteste offene Rechnung ${daysOld} Tage, Frist ${fristDays} Tage${overdue ? `, ${over} Tage überfällig` : ""}`}
>
	<div class="relative h-3.5">
		<div class="absolute inset-x-0 inset-y-[2px] overflow-hidden rounded-md" style:background-color={TOKEN.track}>
			<div class="absolute inset-y-0 right-0" style:width={`${100 - fristPct}%`} style:background-color={TOKEN.overTint}></div>
		</div>
		{#if overdue}
			<div class="absolute inset-y-0 left-0 rounded-l-md" style:width={`${fristPct}%`} style:background-color={TOKEN.warn}></div>
			<div class="absolute inset-y-0" style:left={`${fristPct}%`} style:width={`${daysPct - fristPct}%`} style:background-color={TOKEN.over}></div>
		{:else}
			<div class="absolute inset-y-0 left-0 rounded-md" style:width={`${daysPct}%`} style:background-color={TOKEN.warn}></div>
		{/if}
		<div class="absolute inset-y-[-3px] w-0.5 rounded-sm" style:left={`${fristPct}%`} style:background-color={TOKEN.ink700}></div>
		<div
			class="absolute top-1/2 size-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px]"
			style:left={`${daysPct}%`}
			style:border-color={TOKEN.card}
			style:background-color={overdue ? TOKEN.over : TOKEN.warn}
		></div>
	</div>
	<div class="relative mt-1.5 h-[15px] text-[10px] font-semibold text-ink-500">
		<span class="absolute left-0">0 T</span>
		{#if mergeLabels}
			<span class="absolute right-0 font-bold text-ink-700">Frist {fristDays} T · <span style:color={overdue ? TOKEN.overText : TOKEN.ink500}>älteste {daysOld} T</span></span>
		{:else}
			<span class="absolute -translate-x-1/2 font-bold text-ink-700" style:left={`${fristPct}%`}>Frist {fristDays} T</span>
			<span class="absolute right-0 font-bold" style:color={overdue ? TOKEN.overText : TOKEN.ink500}>älteste {daysOld} T</span>
		{/if}
	</div>
</div>

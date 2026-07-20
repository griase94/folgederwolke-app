<script lang="ts" module>
	export interface CompareBarsProps {
		/** Einnahmen, integer cents. */
		einnahmenCents: number;
		/** Ausgaben, integer cents. */
		ausgabenCents: number;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * Two-bar composition (dataviz §6 stat-tiles EÜR) — Einnahmen (green) vs
	 * Ausgaben (rose) on one shared scale, each length keyed to the larger of the
	 * two. The result reads from the tile value above; this shows the split.
	 */
	import { TOKEN } from "../_shared/tokens.js";
	import { eurWhole } from "../_shared/format.js";

	let { einnahmenCents, ausgabenCents, class: className }: CompareBarsProps = $props();

	const hi = $derived(Math.max(einnahmenCents, ausgabenCents, 1));

	const rows = $derived([
		{ key: "Einnahmen", cents: einnahmenCents, color: TOKEN.einnahme },
		{ key: "Ausgaben", cents: ausgabenCents, color: TOKEN.ausgabe },
	]);
</script>

<div
	data-slot="compare-bars"
	data-testid="compare-bars"
	class={["flex flex-col gap-2.5", className]}
	role="img"
	aria-label={`Einnahmen ${eurWhole(einnahmenCents)}, Ausgaben ${eurWhole(ausgabenCents)}`}
>
	{#each rows as row (row.key)}
		<div class="flex items-center gap-2.5">
			<span class="flex w-[74px] flex-none items-center gap-1.5 text-[10.5px] font-bold uppercase text-ink-500">
				<span class="size-2 flex-none rounded-[2px]" style:background-color={row.color}></span>
				{row.key}
			</span>
			<span class="h-2 flex-1 overflow-hidden rounded-[5px]" style:background-color={TOKEN.track}>
				<span class="block h-full rounded-[5px]" style:width={`${(row.cents / hi) * 100}%`} style:background-color={row.color}></span>
			</span>
			<span class="w-[70px] flex-none text-right text-[11.5px] font-bold tabular-nums text-ink-700">{eurWhole(row.cents)}</span>
		</div>
	{/each}
</div>

<script lang="ts" module>
	export interface KpiTileProps {
		/** Uppercase eyebrow label. */
		label: string;
		/** Pre-formatted value string (money via formatMoney, or a plain count). */
		value: string;
		/** Optional accent colour (CSS var string) for the leading swatch. */
		accent?: string;
		class?: string;
		[key: `data-${string}`]: string | undefined;
	}
</script>

<script lang="ts">
	/**
	 * KpiTile — one tile of the type-list KPI strip (plate transaktionen-v4
	 * `.kpirow > .tile`): an eyebrow label with an optional identity swatch over a
	 * large tabular value. Values are pre-formatted by the caller (money stays
	 * ink-900 — the type/sphere hue lives on the swatch, never on the number,
	 * ANDY-LENS §4). Extra attributes (e.g. data-sphere-chip) spread onto the root.
	 */
	let { label, value, accent, class: className, ...rest }: KpiTileProps = $props();
</script>

<div
	class={['flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card px-3.5 py-3', className]}
	{...rest}
>
	<div class="flex items-center gap-2">
		{#if accent}
			<span class="size-2 flex-none rounded-[3px]" style:background-color={accent}></span>
		{/if}
		<span class="truncate text-[11px] font-bold uppercase tracking-wider text-ink-500">{label}</span>
	</div>
	<span class="text-xl font-bold tabular-nums text-ink-900">{value}</span>
</div>

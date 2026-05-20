<script lang="ts" module>
	import Sparkline from '$lib/components/admin/dashboard/Sparkline.svelte';
	import { formatMoney } from '$lib/components/ui/money/index.js';

	export interface MonthlyTrendStripProps {
		/** Length-12 Einnahmen−Ausgaben cents, Jan=0..Dec=11. */
		monthlyOverschuss: number[];
		year: number;
	}

	const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;
</script>

<script lang="ts">
	let { monthlyOverschuss, year }: MonthlyTrendStripProps = $props();

	const totalCents = $derived(monthlyOverschuss.reduce((a, b) => a + b, 0));
	const max = $derived(Math.max(...monthlyOverschuss.map((v) => Math.abs(v)), 0));
	const tone = $derived<'positive' | 'negative' | 'neutral'>(
		totalCents > 0 ? 'positive' : totalCents < 0 ? 'negative' : 'neutral'
	);

	function barHeight(v: number): number {
		if (max === 0) return 0;
		return Math.round((Math.abs(v) / max) * 100);
	}
</script>

<div
	data-testid="monthly-trend-strip"
	class="rounded-xl border border-border bg-card p-5 shadow-sm"
>
	<div class="flex items-baseline justify-between gap-3">
		<div>
			<h3 class="text-sm font-semibold text-foreground">Monatlicher Überschuss-Verlauf</h3>
			<p class="mt-0.5 text-xs text-muted-foreground">
				{year} · Einnahmen − Ausgaben pro Monat
			</p>
		</div>
		<div
			class="text-right text-sm font-semibold tabular-nums"
			class:text-emerald-700={totalCents >= 0}
			class:text-rose-700={totalCents < 0}
			data-testid="monthly-trend-total"
		>
			{formatMoney(totalCents)}
		</div>
	</div>

	<!-- Sparkline overview -->
	<div class="mt-4 flex items-center gap-3">
		<Sparkline
			data={monthlyOverschuss}
			width={320}
			height={48}
			tone={tone}
			class="w-full max-w-md"
		/>
	</div>

	<!-- Bar strip with month labels -->
	<div class="mt-4">
		<div class="flex items-end gap-1.5 h-16" aria-hidden="true">
			{#each monthlyOverschuss as v, i (i)}
				<div class="flex flex-1 flex-col items-center justify-end">
					<div
						class={`w-full rounded-sm ${v >= 0 ? 'bg-emerald-500/70 dark:bg-emerald-600/70' : 'bg-rose-500/70 dark:bg-rose-600/70'}`}
						style:height={`${Math.max(2, barHeight(v))}%`}
						title={`${MONTH_LABELS[i]}: ${formatMoney(v)}`}
						data-testid={`trend-bar-${i + 1}`}
					></div>
				</div>
			{/each}
		</div>
		<div class="mt-1 flex gap-1.5 text-[10px] text-muted-foreground">
			{#each MONTH_LABELS as label, i (i)}
				<div class="flex-1 text-center">{label}</div>
			{/each}
		</div>
	</div>
</div>

<script lang="ts" module>
	import { formatMoney } from '$lib/components/ui/money/index.js';

	export interface MonthlyTrendStripProps {
		/** Length-12 Einnahmen−Ausgaben cents, Jan=0..Dec=11. */
		monthlyOverschuss: number[];
		year: number;
	}

	const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

	/** Inline sparkline helper (Sparkline.svelte was a dashboard widget, now deleted). */
	function computeSparklinePoints(data: number[], width: number, height: number, pad = 2): string {
		if (data.length === 0) return '';
		const n = data.length;
		const min = Math.min(...data);
		const max = Math.max(...data);
		const range = max - min;
		const innerH = height - pad * 2;
		const stepX = n > 1 ? (width - pad * 2) / (n - 1) : 0;
		return data
			.map((v, i) => {
				const x = pad + i * stepX;
				const y = range === 0 ? height / 2 : pad + innerH - ((v - min) / range) * innerH;
				return `${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}
</script>

<script lang="ts">
	let { monthlyOverschuss, year }: MonthlyTrendStripProps = $props();

	const totalCents = $derived(monthlyOverschuss.reduce((a, b) => a + b, 0));
	const max = $derived(Math.max(...monthlyOverschuss.map((v) => Math.abs(v)), 0));
	const tone = $derived<'positive' | 'negative' | 'neutral'>(
		totalCents > 0 ? 'positive' : totalCents < 0 ? 'negative' : 'neutral'
	);

	// C1-L5 — render a "zu wenig Daten" placeholder when fewer than 5 months
	// have non-zero data. A sparse line/strip is more confusing than helpful;
	// the placeholder tells the user to come back after more bookings.
	const nonZeroMonths = $derived(monthlyOverschuss.filter((v) => v !== 0).length);
	const sparse = $derived(nonZeroMonths < 5);

	function barHeight(v: number): number {
		if (max === 0) return 0;
		return Math.round((Math.abs(v) / max) * 100);
	}

	const sparklinePoints = $derived(computeSparklinePoints(monthlyOverschuss, 320, 48));
	const sparklineToneClass = $derived(
		tone === 'positive'
			? 'text-emerald-600'
			: tone === 'negative'
				? 'text-rose-600'
				: 'text-muted-foreground'
	);
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

	{#if sparse}
		<div
			data-testid="monthly-trend-sparse"
			class="mt-4 rounded-lg border border-dashed border-border/60 bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground"
		>
			Zu wenig Daten für eine Trendlinie — {nonZeroMonths} von 12 Monaten
			haben Buchungen. Ab 5 Monaten zeigen wir den Verlauf.
		</div>
	{:else}
		<!-- Sparkline overview (inlined — Sparkline.svelte deleted with legacy dashboard widgets) -->
		<div class="mt-4 flex items-center gap-3">
			<svg
				data-testid="sparkline"
				class={`sparkline overflow-visible w-full max-w-md ${sparklineToneClass}`}
				viewBox="0 0 320 48"
				width="320"
				height="48"
				aria-hidden="true"
				role="img"
			>
				<polyline
					points={sparklinePoints}
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linejoin="round"
					stroke-linecap="round"
					vector-effect="non-scaling-stroke"
				/>
			</svg>
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
	{/if}
</div>

<script lang="ts">
	/**
	 * WGB Einnahmen YTD widget — Kleinunternehmer §19 UStG Freigrenze tracker.
	 *
	 * The crons-and-wgb agent owns the real implementation. This is the stub
	 * that renders until their WGBWidget is exposed and importable.
	 *
	 * Props are intentionally typed loosely so wiring is painless once the
	 * real component is ready.
	 */

	interface Props {
		/** WGB gross income YTD in cents. Pass 0 until crons-and-wgb agent delivers. */
		wgbYtdCents?: number;
		/** Kleinunternehmer-Freigrenze in cents. Default: 45_000_00 (§19 UStG 2024+). */
		freigrenzeCents?: number;
	}

	let { wgbYtdCents = 0, freigrenzeCents = 4_500_000 }: Props = $props();

	const pct = $derived(
		freigrenzeCents > 0 ? Math.min(100, Math.round((wgbYtdCents / freigrenzeCents) * 100)) : 0
	);

	function formatEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	const isStub = $derived(wgbYtdCents === 0);
</script>

<section
	aria-labelledby="wgb-heading"
	class="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm"
>
	<h2 id="wgb-heading" class="mb-1 text-sm font-semibold text-foreground">
		WGB Einnahmen YTD
	</h2>
	<p class="mb-3 text-xs text-muted-foreground">
		Kleinunternehmer-Freigrenze §19 UStG · Limit: {formatEur(freigrenzeCents)}
	</p>

	{#if isStub}
		<p class="text-xs text-muted-foreground italic">
			WGB-Daten werden vom crons-and-wgb Agenten bereitgestellt — noch nicht verfügbar.
		</p>
	{:else}
		<div class="mb-2 flex items-end justify-between">
			<span class="text-2xl font-bold text-foreground">{formatEur(wgbYtdCents)}</span>
			<span class="text-sm font-medium text-muted-foreground">{pct}%</span>
		</div>

		<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
			<div
				class="h-full rounded-full transition-all {pct >= 80
					? 'bg-destructive'
					: pct >= 60
						? 'bg-yellow-500'
						: 'bg-primary'}"
				style="width: {pct}%"
				role="progressbar"
				aria-valuenow={pct}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Anteil der Freigrenze"
			></div>
		</div>

		{#if pct >= 80}
			<p class="mt-2 text-xs font-medium text-destructive">
				Achtung: Freigrenze zu {pct}% ausgeschöpft!
			</p>
		{/if}
	{/if}
</section>

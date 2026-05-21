<script lang="ts">
	/**
	 * WGBWidget — Wirtschaftlicher Geschäftsbetrieb Freigrenze tracker.
	 *
	 * Shows YTD gross Einnahmen (wirtschaftlich sphere) versus the
	 * § 64 Abs. 3 AO Besteuerungsfreigrenze of 50.000 € gross (ab 2025).
	 * Distinct from § 19 UStG Kleinunternehmer (25.000 / 100.000 € ab 2025).
	 *
	 * Data comes from the dashboard +page.server.ts which queries
	 * v_wgb_freigrenze_status.
	 */

	interface Props {
		/** YTD gross Einnahmen in cents (wirtschaftlich sphere, current year). */
		einnahmenCents: number;
		/** Statutory Freigrenze in cents (50.000 € = 5_000_000, § 64 Abs. 3 AO). */
		freigrenzeCents: number;
		/** Pre-computed status from v_wgb_freigrenze_status view. */
		status: 'ok' | 'erhoeht' | 'kritisch' | 'ueberschritten';
		/** Current fiscal year (Berlin timezone). */
		year: number;
	}

	let { einnahmenCents, freigrenzeCents, status, year }: Props = $props();

	const formatEur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	const pct = $derived(Math.min(100, Math.round((einnahmenCents / freigrenzeCents) * 100)));
	const restCents = $derived(Math.max(0, freigrenzeCents - einnahmenCents));

	const barColor = $derived(
		status === 'ueberschritten'
			? 'bg-red-500'
			: status === 'kritisch'
				? 'bg-orange-500'
				: status === 'erhoeht'
					? 'bg-yellow-400'
					: 'bg-emerald-500'
	);

	const statusLabel = $derived(
		status === 'ueberschritten'
			? 'Freigrenze überschritten'
			: status === 'kritisch'
				? 'Kritisch (>80 %)'
				: status === 'erhoeht'
					? 'Erhöht (>50 %)'
					: 'Im grünen Bereich'
	);

	const badgeClasses = $derived(
		status === 'ueberschritten'
			? 'bg-red-100 text-red-800'
			: status === 'kritisch'
				? 'bg-orange-100 text-orange-800'
				: status === 'erhoeht'
					? 'bg-yellow-100 text-yellow-800'
					: 'bg-emerald-100 text-emerald-800'
	);
</script>

{#if status === 'ok'}
	<!--
		C4-DASH-lite (UI-003): when the §64-Freigrenze is comfortably uncrossed
		(ok), collapse the full card into a one-line chip so the dashboard
		stays scannable. Reviewers asked for a clear visual difference vs the
		full card; assert via [data-component="wgb-chip"] in e2e.
	-->
	<div
		class="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-sm dark:border-border/60 dark:bg-card/40"
		data-component="wgb-chip"
		data-status={status}
		aria-label="WGB-Freigrenze {year}: {formatEur(einnahmenCents)} von {formatEur(freigrenzeCents)}, im grünen Bereich"
	>
		<div class="flex items-center gap-2 text-muted-foreground">
			<span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
			<span>WGB {year}:</span>
			<span class="font-semibold text-foreground tabular-nums">{formatEur(einnahmenCents)}</span>
			<span class="text-xs">/ {formatEur(freigrenzeCents)}</span>
		</div>
		<span
			class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
		>
			Im grünen Bereich
		</span>
	</div>
{:else}
	<section
		aria-labelledby="wgb-heading"
		class="rounded-xl border border-border bg-card p-5 shadow-sm dark:border-border/60 dark:bg-card/40"
		data-component="wgb-card"
		data-status={status}
	>
		<!-- Header row -->
		<div class="flex items-start justify-between gap-2">
			<div>
				<h2 id="wgb-heading" class="text-sm font-medium text-muted-foreground">
					WGB-Freigrenze {year}
					<span class="font-normal">(§ 64 Abs. 3 AO)</span>
				</h2>
				<p class="mt-1 text-2xl font-bold tracking-tight text-foreground">
					{formatEur(einnahmenCents)}
				</p>
			</div>
			<span class="mt-1 rounded-full px-2 py-0.5 text-xs font-semibold {badgeClasses}">
				{statusLabel}
			</span>
		</div>

		<!-- Progress bar -->
		<div class="mt-4">
			<div class="mb-1 flex justify-between text-xs text-muted-foreground">
				<span>{pct} % von {formatEur(freigrenzeCents)}</span>
				{#if status !== 'ueberschritten'}
					<span>Noch {formatEur(restCents)}</span>
				{/if}
			</div>
			<div class="h-2.5 w-full overflow-hidden rounded-full bg-muted dark:bg-muted/40">
				<div
					class="h-full rounded-full transition-all {barColor}"
					style="width: {pct}%"
					role="progressbar"
					aria-valuenow={pct}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label="WGB-Freigrenze {pct} % ausgeschöpft"
				></div>
			</div>
		</div>

		<!-- Statutory note -->
		<p class="mt-3 text-xs text-muted-foreground">
			Brutto-Einnahmen des wirtschaftlichen Geschäftsbetriebs. Einnahmen über
			50.000&nbsp;€/Jahr lösen die Körperschaft- und Gewerbesteuerpflicht aus
			(§ 64 Abs. 3 AO, ab&nbsp;2025).
		</p>
	</section>
{/if}

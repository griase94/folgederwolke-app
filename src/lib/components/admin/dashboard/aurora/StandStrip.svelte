<script lang="ts">
	/**
	 * Stand strip (spec §7 · dataviz §6 saldo-verlauf) — the dashboard leads with
	 * the running Vereins-Saldo as a hero figure + achs-less sparkline
	 * (SaldoVerlauf), with a desktop-hover month card. The running series is the
	 * cumulative net of the year's cash months, so its endpoint equals the YTD
	 * Saldo by construction. Below the hero: the Festschreibung lock chip, the
	 * zugesagt/frei subline (current year only), and the Einnahmen/Spenden/
	 * Ausgaben triplet. All money integer cents.
	 */
	// Import the component directly (not via the charts barrel) so the dashboard
	// pulls only SaldoVerlauf into the client bundle, never the whole family —
	// the barrel isn't tree-shakeable (package has no `sideEffects: false`).
	import SaldoVerlauf from '$lib/components/charts/saldo-verlauf/SaldoVerlauf.svelte';
	// One shared money formatter (real U+2212 minus) — same as the charts, so the
	// Stand-strip triplet never drifts to an ASCII hyphen (board MAJOR 3).
	import { eurCents as formatMoney } from '$lib/components/charts/_shared/format.js';

	let {
		saldoCents,
		zugesagtCents,
		einnahmenCents,
		einnahmenCount,
		spendenCents,
		spendenCount,
		ausgabenCents,
		ausgabenCount,
		einnahmenMonthlyCents,
		ausgabenMonthlyCents,
		selectedYear,
		currentYear,
		festgeschriebenBis
	}: {
		saldoCents: number;
		zugesagtCents: number;
		einnahmenCents: number;
		einnahmenCount: number;
		spendenCents: number;
		spendenCount: number;
		ausgabenCents: number;
		ausgabenCount: number;
		/** 12 monthly Einnahmen totals (income+Spenden+Beiträge), cents. */
		einnahmenMonthlyCents: number[];
		/** 12 monthly Ausgaben totals, cents. */
		ausgabenMonthlyCents: number[];
		selectedYear: number;
		currentYear: number;
		festgeschriebenBis: number | null;
	} = $props();

	const isCurrentYear = $derived(selectedYear === currentYear);
	const freiCents = $derived(saldoCents - zugesagtCents);
	const locked = $derived(
		festgeschriebenBis !== null && selectedYear <= festgeschriebenBis
	);

	// Running Saldo = cumulative net of the year's cash months. Trailing empty
	// months are trimmed so the sparkline ends at the last booked month (the
	// current stand), not a flat run to Dezember. Endpoint === saldoCents.
	const saldoTrendCents = $derived.by(() => {
		const out: number[] = [];
		let acc = 0;
		let lastActive = 0;
		for (let i = 0; i < 12; i++) {
			const e = einnahmenMonthlyCents[i] ?? 0;
			const a = ausgabenMonthlyCents[i] ?? 0;
			if (e !== 0 || a !== 0) lastActive = i;
			acc += e - a;
			out.push(acc);
		}
		return out.slice(0, Math.max(lastActive + 1, 2));
	});

	function buchungenLabel(n: number): string {
		return n === 1 ? '1 Buchung' : `${n} Buchungen`;
	}
</script>

<section aria-label={`Finanzlage ${selectedYear}`} class="flex flex-col gap-5">
	{#if locked}
		<div>
			<span
				data-testid="stand-lock-chip"
				class="inline-flex items-center gap-1 rounded-full border border-(--hairline) bg-card px-2 py-0.5 text-[11px] font-medium text-ink-500"
			>
				<svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<rect x="3" y="11" width="18" height="11" rx="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
				Festgeschrieben
			</span>
		</div>
	{/if}

	<SaldoVerlauf
		monthlyCents={saldoTrendCents}
		openingCents={0}
		year={selectedYear}
		eyebrow={`Saldo ${selectedYear}`}
	/>

	{#if isCurrentYear}
		<p data-testid="stand-subline" class="-mt-1 text-sm tabular-nums text-ink-500">
			davon {formatMoney(zugesagtCents)} für Erstattungen zugesagt · {formatMoney(freiCents)} frei
		</p>
	{/if}

	{#snippet stat(label: string, cents: number, count: number, testid: string)}
		<div class="flex min-w-0 flex-col" data-testid={testid}>
			<dt class="text-xs font-medium text-ink-500">{label}</dt>
			<dd class="mt-0.5 truncate text-base font-semibold tabular-nums text-ink-900 md:text-lg">
				{formatMoney(cents)}
			</dd>
			<dd class="text-xs text-ink-500">{buchungenLabel(count)}</dd>
		</div>
	{/snippet}

	<dl class="grid grid-cols-3 gap-3 border-t border-(--hairline) pt-4 md:gap-10">
		{@render stat('Einnahmen', einnahmenCents, einnahmenCount, 'stand-stat-einnahmen')}
		{@render stat('Spenden', spendenCents, spendenCount, 'stand-stat-spenden')}
		{@render stat('Ausgaben', -ausgabenCents, ausgabenCount, 'stand-stat-ausgaben')}
	</dl>
</section>

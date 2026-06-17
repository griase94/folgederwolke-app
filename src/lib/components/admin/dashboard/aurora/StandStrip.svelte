<script lang="ts">
	/**
	 * Stand strip (spec §7) — card-less, sits directly on the aurora wash.
	 * Hero saldo is gradient-clipped (large-text tier, §2 contrast contract);
	 * NEGATIVE saldo is solid ink — no gradient, no red. Subline (zugesagt/frei)
	 * renders only for the current Berlin year. All money integer cents.
	 */
	import { formatMoney } from '$lib/components/ui/money/money.svelte';

	let {
		saldoCents,
		zugesagtCents,
		einnahmenCents,
		einnahmenCount,
		spendenCents,
		spendenCount,
		ausgabenCents,
		ausgabenCount,
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
		// selectedYear/currentYear come from the layout parent-data merge
		// (src/routes/app/+layout.server.ts returns them; PageData already
		// includes them) — the page passes them down. Do NOT add them to
		// +page.server.ts.
		selectedYear: number;
		currentYear: number;
		festgeschriebenBis: number | null;
	} = $props();

	const isCurrentYear = $derived(selectedYear === currentYear);
	const freiCents = $derived(saldoCents - zugesagtCents);
	const locked = $derived(
		festgeschriebenBis !== null && selectedYear <= festgeschriebenBis
	);

	// Demoted decimals: split "1.234,56 €" at the comma.
	const formatted = $derived(formatMoney(saldoCents));
	const commaIdx = $derived(formatted.indexOf(','));
	const heroMain = $derived(commaIdx === -1 ? formatted : formatted.slice(0, commaIdx));
	const heroRest = $derived(commaIdx === -1 ? '' : formatted.slice(commaIdx));

	function buchungenLabel(n: number): string {
		return n === 1 ? '1 Buchung' : `${n} Buchungen`;
	}
</script>

<section
	aria-labelledby="stand-heading"
	class="flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
>
	<div>
		<div class="flex items-center gap-2">
			<h2
				id="stand-heading"
				class="text-xs font-semibold uppercase tracking-[0.08em] text-ink-500"
			>
				Saldo {selectedYear}
			</h2>
			{#if locked}
				<span
					data-testid="stand-lock-chip"
					class="inline-flex items-center gap-1 rounded-full border border-(--hairline) bg-white px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-ink-500"
				>
					<svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<rect x="3" y="11" width="18" height="11" rx="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
					Festgeschrieben
				</span>
			{/if}
		</div>
		<p class="mt-1 tabular-nums">
			{#if saldoCents < 0}
				<span
					data-testid="stand-hero"
					class="text-[40px] font-bold tracking-[-0.02em] text-ink-900 md:text-5xl"
					>{heroMain}<span class="text-2xl font-semibold md:text-3xl">{heroRest}</span></span
				>
			{:else}
				<span
					data-testid="stand-hero"
					class="bg-clip-text text-[40px] font-bold tracking-[-0.02em] text-transparent [background-image:var(--gradient-brand)] md:text-5xl"
					>{heroMain}<span class="text-2xl font-semibold md:text-3xl">{heroRest}</span></span
				>
			{/if}
		</p>
		{#if isCurrentYear}
			<p data-testid="stand-subline" class="mt-1 text-sm tabular-nums text-ink-500">
				davon {formatMoney(zugesagtCents)} für Erstattungen zugesagt · {formatMoney(freiCents)} frei
			</p>
		{/if}
	</div>

	{#snippet stat(label: string, cents: number, count: number, testid: string)}
		<div class="flex min-w-0 flex-col" data-testid={testid}>
			<dt class="text-xs font-medium text-ink-500">{label}</dt>
			<dd class="mt-0.5 truncate text-base font-semibold tabular-nums text-ink-900 md:text-lg">
				{formatMoney(cents)}
			</dd>
			<dd class="text-xs text-ink-500">{buchungenLabel(count)}</dd>
		</div>
	{/snippet}

	<dl class="grid grid-cols-3 gap-3 md:gap-10">
		{@render stat('Einnahmen', einnahmenCents, einnahmenCount, 'stand-stat-einnahmen')}
		{@render stat('Spenden', spendenCents, spendenCount, 'stand-stat-spenden')}
		{@render stat('Ausgaben', -ausgabenCents, ausgabenCount, 'stand-stat-ausgaben')}
	</dl>
</section>

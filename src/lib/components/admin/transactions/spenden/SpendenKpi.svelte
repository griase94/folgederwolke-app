<!--
  SpendenKpi — the Spenden list KPI strip (spec §8 M1, §9.1).

  Three StatCards (Summe · Anzahl · Versandt) plus the §9.1 delight: a
  DISAPPEARING "N ohne Bescheinigung" pill that is ABSENT when every donation
  is bescheinigt. There is NO Sammelbestätigungs-Fenster / deadline (no
  statutory cutoff → a deadline would be a false signal). No own <h1>:
  PageHeader owns the title.

  "Versandt" is a RATIO ("3 von 6"), never "3 versandt" — the label inside the
  value was the original Andy finding on this very strip. Its dot is neutral:
  versandt is a STATUS, and status hues never ride the identity dot.
-->
<script lang="ts">
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { StatCard, StatCardStrip } from '$lib/components/ui/stat-card/index.js';
	import { yearScopeLabel, yearScopeMetaLabel, type YearScope } from '$lib/domain/year.js';
	import { spendenLabel as fmtSpenden } from '$lib/domain/transaction-kpi.js';

	interface Props {
		totalCents: number;
		count: number;
		ohneBescheinigungCount: number;
		versandtCount: number;
		year: YearScope;
	}

	let { totalCents, count, ohneBescheinigungCount, versandtCount, year }: Props = $props();

	const yearLabel = $derived(yearScopeLabel(year));
	const metaLabel = $derived(yearScopeMetaLabel(year));
	const spendenLabel = $derived(fmtSpenden(count));
	const leer = $derived(count === 0);
</script>

<div data-testid="kpi-strip" class="flex flex-col gap-2.5">
	<StatCardStrip orientation="rail" label="Spenden-Kennzahlen">
		<StatCard
			label="Summe Spenden"
			format="money"
			value={formatMoney(totalCents)}
			accent="var(--type-spende)"
			sub={leer ? `Noch keine Spenden in ${yearLabel}` : `${yearLabel} · ${spendenLabel}`}
			empty={leer}
		/>
		<StatCard label="Anzahl" format="count" value={String(count)} sub={metaLabel} empty={leer} />
		<StatCard
			label="Versandt"
			format="ratio"
			value={`${versandtCount} von ${count}`}
			sub={`Bescheinigungen ${yearLabel}`}
			empty={leer}
		/>
	</StatCardStrip>

	{#if ohneBescheinigungCount > 0}
		<!-- §9.1 disappearing pill: absent when every donation is bescheinigt. -->
		<span
			data-testid="kpi-ohne-bescheinigung"
			class="inline-flex w-fit items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
		>
			{ohneBescheinigungCount} ohne Bescheinigung
		</span>
	{/if}
</div>

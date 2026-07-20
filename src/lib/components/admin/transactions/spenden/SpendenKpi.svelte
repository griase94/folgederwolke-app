<!--
  SpendenKpi — the Spenden list KPI strip (spec §9.1, plate transaktionen-v4 §4).

  Kit tiles (Summe · Anzahl · Versandt) with the Jahr · N-Spenden anchor folded
  into the Summe tile, plus the §9.1 delight: a DISAPPEARING "N ohne
  Bescheinigung" amber pill that is ABSENT when every donation is bescheinigt.
  There is NO Sammelbestätigungs-Fenster / deadline (no statutory cutoff → a
  deadline would be a false signal). No own <h1>: PageHeader owns the title.
-->
<script lang="ts">
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import KpiStrip from '../KpiStrip.svelte';
	import KpiTile from '../KpiTile.svelte';
	import { yearScopeLabel, type YearScope } from '$lib/domain/year.js';
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
	const spendenLabel = $derived(fmtSpenden(count));
</script>

<div data-testid="kpi-strip" class="flex flex-col gap-2.5">
	<KpiStrip>
		<KpiTile
			label="Summe Spenden"
			value={formatMoney(totalCents)}
			accent="var(--type-spende)"
			sub={`${yearLabel} · ${spendenLabel}`}
		/>
		<KpiTile label="Anzahl" value={String(count)} />
		<KpiTile
			label="Versandt"
			value={`${versandtCount} versandt`}
			accent="var(--type-einnahme)"
		/>
	</KpiStrip>

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

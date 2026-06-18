<!--
  SpendenKpi — the Spenden list header strip (spec §9.1, Phase 6 Task 2).

  A quiet anchor (Jahr|Alle · Summe · N Spenden) followed by two status pills:
    - "N ohne Bescheinigung" — DISAPPEARS at zero (the §9.1 delight: when every
      donation is bescheinigt there is no nagging pill).
    - "M Bescheinigungen versandt" — the count of issued Zuwendungsbestätigungen.

  There is NO Sammelbestätigungs-Fenster / deadline pill (§9.1): no statutory
  cutoff exists, so a deadline would be a false signal.
-->
<script lang="ts">
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
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

<div data-testid="kpi-strip">
	<!-- No <h1>: PageHeader owns the page title; render only the quiet anchor. -->
	<p class="text-sm text-muted-foreground" data-testid="spenden-kpi-anchor">
		{yearLabel} · {formatMoney(totalCents)} · {spendenLabel}
	</p>

	<!-- Status pills. -->
	<div class="mt-2 flex flex-wrap items-center gap-2">
		{#if ohneBescheinigungCount > 0}
			<span
				data-testid="kpi-ohne-bescheinigung"
				class="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
			>
				{ohneBescheinigungCount} ohne Bescheinigung
			</span>
		{/if}
		<span
			data-testid="kpi-versandt"
			class="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
		>
			{versandtCount} Bescheinigungen versandt
		</span>
	</div>
</div>

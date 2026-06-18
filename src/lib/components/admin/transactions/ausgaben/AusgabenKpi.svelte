<script lang="ts">
	/**
	 * AusgabenKpi — the Ausgaben list-header KPI strip (spec §7.1).
	 *
	 * A quiet header: the "Ausgaben" title, the year + booking count + total as a
	 * calm anchor line, and a single DISAPPEARING pill — "N offen · älteste X Tage".
	 *
	 * The pill is the §7.1 delight: it renders ONLY when `offenCount > 0` (there
	 * are approved-but-unreimbursed Auslagen waiting). With zero open rows the pill
	 * is absent entirely — no "0 offen" nag. The age suffix ("· älteste X Tage")
	 * appears only when an age is known (`oldestOpenAgeDays != null`).
	 */
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { yearScopeLabel, type YearScope } from '$lib/domain/year.js';
	import { buchungenLabel as fmtBuchungen } from '$lib/domain/transaction-kpi.js';

	interface Props {
		totalCents: number;
		count: number;
		offenCount: number;
		oldestOpenAgeDays: number | null;
		year: YearScope;
	}

	let { totalCents, count, offenCount, oldestOpenAgeDays, year }: Props = $props();

	const yearLabel = $derived(yearScopeLabel(year));
	const buchungenLabel = $derived(fmtBuchungen(count));
</script>

<div data-testid="kpi-strip">
	<!-- No <h1> here: PageHeader owns the page title. This KPI strip renders only
	     the quiet meta line + the disappearing offen-pill inside the meta slot. -->
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
		<span>{yearLabel}</span>
		<span aria-hidden="true">·</span>
		<span>{buchungenLabel}</span>
		<span aria-hidden="true">·</span>
		<span>Summe {formatMoney(totalCents)}</span>
	</div>

	{#if offenCount > 0}
		<!-- §7.1 disappearing pill: only present when there are open Auslagen. -->
		<span
			data-testid="offen-pill"
			class="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200"
		>
			{offenCount} offen{#if oldestOpenAgeDays != null}&nbsp;· älteste {oldestOpenAgeDays}
				{oldestOpenAgeDays === 1 ? 'Tag' : 'Tage'}{/if}
		</span>
	{/if}
</div>

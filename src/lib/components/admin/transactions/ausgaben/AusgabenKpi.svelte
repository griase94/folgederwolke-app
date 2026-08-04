<script lang="ts">
	/**
	 * AusgabenKpi — the Ausgaben list KPI strip (spec §8 M2, §7.1).
	 *
	 * Three StatCards (Summe · Anzahl · Erstattet) plus the §7.1 delight — a
	 * DISAPPEARING "N offen · älteste X Tage" pill that renders ONLY when there
	 * are approved-but-unreimbursed Auslagen waiting (zero open → no "0 offen"
	 * nag). No own <h1>: PageHeader owns the page title.
	 *
	 * M2 correction: "Erstattet" used to wear the Einnahme green as its accent —
	 * an identity hue standing in for a status, which reads as "reimbursed money
	 * is income". The dot is neutral now; a status, if one is ever wanted here,
	 * belongs in the meta slot.
	 */
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { StatCard, StatCardStrip } from '$lib/components/ui/stat-card/index.js';
	import { yearScopeLabel, yearScopeMetaLabel, type YearScope } from '$lib/domain/year.js';
	import { buchungenLabel as fmtBuchungen } from '$lib/domain/transaction-kpi.js';

	interface Props {
		totalCents: number;
		count: number;
		erstattetCount: number;
		offenCount: number;
		oldestOpenAgeDays: number | null;
		year: YearScope;
	}

	let { totalCents, count, erstattetCount, offenCount, oldestOpenAgeDays, year }: Props = $props();

	const yearLabel = $derived(yearScopeLabel(year));
	const metaLabel = $derived(yearScopeMetaLabel(year));
	const buchungenLabel = $derived(fmtBuchungen(count));
	const leer = $derived(count === 0);
</script>

<div data-testid="kpi-strip" class="flex flex-col gap-2.5">
	<StatCardStrip orientation="rail" label="Ausgaben-Kennzahlen">
		<StatCard
			label="Summe Ausgaben"
			format="money"
			value={formatMoney(totalCents)}
			accentClass="bg-type-ausgabe"
			sub={leer ? `Noch keine Ausgaben in ${yearLabel}` : `${yearLabel} · ${buchungenLabel}`}
			empty={leer}
		/>
		<StatCard label="Anzahl" format="count" value={String(count)} sub={metaLabel} empty={leer} />
		<StatCard
			label="Erstattet"
			format="count"
			value={String(erstattetCount)}
			sub={`Auslagen ${yearLabel}`}
			empty={erstattetCount === 0}
		/>
	</StatCardStrip>

	{#if offenCount > 0}
		<!-- §7.1 disappearing pill: only present when there are open Auslagen. -->
		<span
			data-testid="offen-pill"
			class="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200"
		>
			{offenCount} offen{#if oldestOpenAgeDays != null}&nbsp;· älteste {oldestOpenAgeDays}
				{oldestOpenAgeDays === 1 ? 'Tag' : 'Tage'}{/if}
		</span>
	{/if}
</div>

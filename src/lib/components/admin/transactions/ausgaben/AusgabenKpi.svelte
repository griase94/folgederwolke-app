<script lang="ts">
	/**
	 * AusgabenKpi — the Ausgaben list KPI strip (spec §7.1, plate transaktionen-v4
	 * §4): Kit tiles for Summe + Anzahl, plus the §7.1 delight — a DISAPPEARING
	 * "N offen · älteste X Tage" pill that renders ONLY when there are
	 * approved-but-unreimbursed Auslagen waiting (zero open → no "0 offen" nag).
	 *
	 * The year + booking count live in the PageHeader meta line; this strip is the
	 * money facets. Amounts stay ink-900 (the type hue rides the tile swatch, never
	 * the number — ANDY-LENS §4). No own <h1>: PageHeader owns the page title.
	 */
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import KpiStrip from '../KpiStrip.svelte';
	import KpiTile from '../KpiTile.svelte';

	interface Props {
		totalCents: number;
		count: number;
		erstattetCount: number;
		offenCount: number;
		oldestOpenAgeDays: number | null;
	}

	let { totalCents, count, erstattetCount, offenCount, oldestOpenAgeDays }: Props = $props();
</script>

<div data-testid="kpi-strip" class="flex flex-col gap-2.5">
	<KpiStrip>
		<KpiTile label="Summe Ausgaben" value={formatMoney(totalCents)} accent="var(--type-ausgabe)" />
		<KpiTile label="Anzahl" value={String(count)} />
		<KpiTile label="Erstattet" value={String(erstattetCount)} accent="var(--type-einnahme)" />
	</KpiStrip>

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

<script lang="ts">
	import TransactionListScaffold, {
		type ColumnDef,
	} from '$lib/components/admin/transactions/TransactionListScaffold.svelte';
	import Money from '$lib/components/ui/money/money.svelte';
	import type { TransactionRow } from '$lib/server/domain/transactions.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// Phase-3 MINIMAL columns — the rich Spenden columns (Spendenart/Zweckbindung/
	// Bescheinigung) land in Phase 6. These read only fields common to every list
	// row (the donation `bezeichnung` is already "Spende von …" / kategorie).
	const columns: ColumnDef[] = [
		{ key: 'bezeichnung', label: 'Spender / Bezeichnung', sortable: true, render: bezeichnungCell },
		{ key: 'gebuchtAm', label: 'Datum', sortable: true, render: datumCell },
		{ key: 'betrag', label: 'Betrag', align: 'right', sortable: true, render: betragCell },
	];

	function formatDatum(iso: string): string {
		return new Date(iso).toLocaleDateString('de-DE');
	}
</script>

<svelte:head>
	<title>Spenden – Folge der Wolke</title>
</svelte:head>

{#snippet kpi()}
	<div data-testid="kpi-strip">
		<h1 class="text-2xl font-bold tracking-tight text-foreground">Spenden</h1>
		<p class="mt-0.5 text-sm text-muted-foreground">{data.total} Buchungen</p>
	</div>
{/snippet}

{#snippet bezeichnungCell(row: TransactionRow)}
	<span class="font-medium text-foreground">{row.bezeichnung}</span>
{/snippet}

{#snippet datumCell(row: TransactionRow)}
	<span class="text-muted-foreground">{formatDatum(row.gebuchtAm)}</span>
{/snippet}

{#snippet betragCell(row: TransactionRow)}
	<Money valueInCents={row.betragCents} />
{/snippet}

<div class="container mx-auto max-w-6xl px-4 py-8 sm:px-6">
	<TransactionListScaffold
		tab="spenden"
		rows={data.rows as unknown as TransactionRow[]}
		total={data.total}
		page={data.page}
		pageSize={data.pageSize}
		selectedYear={data.yearScope}
		currentYear={data.currentYear}
		filterState={data.filterState}
		kategorieOptions={data.kategorieOptions}
		memberOptions={data.memberOptions}
		{columns}
		{kpi}
		detailHrefBase="/app/spenden"
		newLabel="Neue Spende"
		newHref="/app/spenden/neu"
	/>
</div>

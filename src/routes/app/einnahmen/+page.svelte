<script lang="ts">
	import TransactionListScaffold, {
		type ColumnDef,
	} from '$lib/components/admin/transactions/TransactionListScaffold.svelte';
	import Money from '$lib/components/ui/money/money.svelte';
	import type { TransactionRow } from '$lib/server/domain/transactions.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// Phase-3 MINIMAL columns — the rich Einnahmen columns (Sphäre/🔗-Rechnung)
	// land in Phase 5. These read only fields common to every list row.
	const columns: ColumnDef[] = [
		{ key: 'bezeichnung', label: 'Bezeichnung', sortable: true, render: bezeichnungCell },
		{ key: 'kategorie', label: 'Kategorie', render: kategorieCell },
		{ key: 'gebuchtAm', label: 'Datum', sortable: true, render: datumCell },
		{ key: 'betrag', label: 'Betrag', align: 'right', sortable: true, render: betragCell },
	];

	function formatDatum(iso: string): string {
		return new Date(iso).toLocaleDateString('de-DE');
	}
</script>

<svelte:head>
	<title>Einnahmen – Folge der Wolke</title>
</svelte:head>

{#snippet kpi()}
	<div data-testid="kpi-strip">
		<h1 class="text-2xl font-bold tracking-tight text-foreground">Einnahmen</h1>
		<p class="mt-0.5 text-sm text-muted-foreground">{data.total} Buchungen</p>
	</div>
{/snippet}

{#snippet bezeichnungCell(row: TransactionRow)}
	<span class="font-medium text-foreground">{row.bezeichnung}</span>
{/snippet}

{#snippet kategorieCell(row: TransactionRow)}
	<span class="text-muted-foreground">{row.kategorieNameSnapshot}</span>
{/snippet}

{#snippet datumCell(row: TransactionRow)}
	<span class="text-muted-foreground">{formatDatum(row.gebuchtAm)}</span>
{/snippet}

{#snippet betragCell(row: TransactionRow)}
	<Money valueInCents={row.betragCents} />
{/snippet}

<div class="container mx-auto max-w-6xl px-4 py-8 sm:px-6">
	<TransactionListScaffold
		tab="einnahmen"
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
		detailHrefBase="/app/einnahmen"
		newLabel="Neue Einnahme"
		newHref="/app/einnahmen/neu"
	/>
</div>

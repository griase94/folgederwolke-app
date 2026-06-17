<script lang="ts">
	/**
	 * /app/einnahmen — Einnahmen list (Aurora slice 5 restyle).
	 * PageShell + PageHeader single-row toolbar + month-grouped TransactionRow
	 * list (type-sum subtotals). Presentation-only; the route server is
	 * unchanged. The 🔗 aus-Rechnung scan signal becomes a row chip.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import StaleYearBanner from '$lib/components/admin/StaleYearBanner.svelte';
	import FilterBar from '$lib/components/admin/transactions/FilterBar.svelte';
	import EinnahmenKpi from '$lib/components/admin/transactions/einnahmen/EinnahmenKpi.svelte';
	import TransactionRow from '$lib/components/ui/TransactionRow.svelte';
	import MonthGroup from '$lib/components/ui/MonthGroup.svelte';
	import { Pagination } from '$lib/components/ui/pagination/index.js';
	import { groupByMonth } from '$lib/domain/month-group.js';
	import { SPHERE_LABELS, type Sphere } from '$lib/domain/sphere.js';
	import { yearScopeLabel } from '$lib/domain/year.js';
	import type { EinnahmenRow } from '$lib/server/domain/transactions.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	function formatDatum(iso: string): string {
		return new Date(iso).toLocaleDateString('de-DE');
	}
	function metaLine(row: EinnahmenRow): string {
		const sphere = SPHERE_LABELS[row.sphereSnapshot as Sphere] ?? row.sphereSnapshot;
		return `${formatDatum(row.gebuchtAm)} · ${sphere} · ${row.kategorieNameSnapshot}`;
	}
	function chips(row: EinnahmenRow): { label: string; kind?: 'warn' | 'neutral' }[] {
		// master §2.4: "aus Rechnung FDW-…" is a provenance signal, not a warning → neutral.
		return row.rechnungBusinessId
			? [{ label: `aus Rechnung ${row.rechnungBusinessId}`, kind: 'neutral' }]
			: [];
	}

	const sortOverride = $derived($page.url.searchParams.has('sort'));
	const groups = $derived(
		groupByMonth(
			data.rows,
			(r) => r.gebuchtAm,
			(r) => r.betragCents,
		),
	);

	const hasActiveFilters = $derived(
		!!data.filterState.search ||
			Object.values(data.filterState.enums).some((v) => v.length > 0) ||
			Object.keys(data.filterState.members).length > 0 ||
			data.filterState.amount.betragMin != null ||
			data.filterState.amount.betragMax != null ||
			Object.values(data.filterState.booleans).some(Boolean),
	);
	const yearLabel = $derived(yearScopeLabel(data.yearScope));

	const exportHref = $derived(
		(() => {
			const qs = $page.url.searchParams.toString();
			return `/app/einnahmen/export${qs ? `?${qs}` : ''}`;
		})(),
	);
	const resetHref = $derived(
		(() => {
			const year = $page.url.searchParams.get('year');
			return `${$page.url.pathname}${year ? `?year=${year}` : ''}`;
		})(),
	);

	function onPageChange(p: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder
		const url = new URLSearchParams($page.url.search);
		if (p <= 1) url.delete('page');
		else url.set('page', String(p));
		const search = url.toString();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same-origin query string
		goto(`${$page.url.pathname}${search ? `?${search}` : ''}`, {
			keepFocus: true,
			noScroll: true,
		});
	}
</script>

<svelte:head>
	<title>Einnahmen – {$page.data.vereinName}</title>
</svelte:head>

{#snippet rowsFor(rows: EinnahmenRow[])}
	{#each rows as row (row.id)}
		<TransactionRow
			type="einnahme"
			title={row.bezeichnung}
			metaLine={metaLine(row)}
			statusChips={chips(row)}
			amountCents={row.betragCents}
			signed={true}
			href={`/app/einnahmen/${row.id}`}
		/>
	{/each}
{/snippet}

<PageShell width="list">
	<PageHeader title="Einnahmen">
		{#snippet meta()}
			<EinnahmenKpi
				totalCents={data.kpi.totalCents}
				count={data.kpi.count}
				bySphere={data.kpi.bySphere}
				year={data.yearScope}
			/>
		{/snippet}
		{#snippet toolbar()}
			<div class="flex w-full flex-wrap items-center gap-2">
				<div class="min-w-0 flex-1">
					<FilterBar
						tab="einnahmen"
						state={data.filterState}
						kategorieOptions={data.kategorieOptions}
						memberOptions={data.memberOptions}
						resultCount={data.total}
					/>
				</div>
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={exportHref}
					data-testid="export-cta"
					title="Gefilterte und sortierte Liste vollständig herunterladen (alle Seiten)"
					class="inline-flex h-11 items-center rounded-[10px] border border-(--hairline) bg-white px-3 text-sm font-medium text-ink-700 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) md:h-10"
					>CSV</a
				>
				<a
					href="/app/einnahmen/neu"
					data-slot="new-cta"
					class="inline-flex h-11 items-center rounded-full bg-primary-strong px-4 text-sm font-semibold text-white shadow-(--glow-brand) transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 md:h-10"
					>Neue Einnahme</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>
		{/snippet}
	</PageHeader>

	<StaleYearBanner selectedYear={data.yearScope} currentYear={data.currentYear} />

	{#if data.rows.length === 0}
		{#if hasActiveFilters}
			<div
				data-testid="empty-no-matches"
				class="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-(--hairline) bg-white/60 px-6 py-12 text-center"
			>
				<p class="text-sm font-medium text-ink-700">Keine Treffer für die aktuellen Filter</p>
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={resetHref}
					class="rounded text-sm font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
					>Filter zurücksetzen</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>
		{:else}
			<div
				data-testid="empty-year"
				class="flex flex-col items-center gap-2 rounded-[16px] border border-dashed border-(--hairline) bg-white/60 px-6 py-12 text-center"
			>
				<p class="text-sm font-medium text-ink-700">Keine Buchungen in {yearLabel}</p>
			</div>
		{/if}
	{:else if sortOverride}
		<div class="flex flex-col">
			{@render rowsFor(data.rows)}
		</div>
		<Pagination
			page={data.page}
			pageSize={data.pageSize}
			total={data.total}
			{onPageChange}
			class="justify-center"
		/>
	{:else}
		{#each groups as g (g.key)}
			<MonthGroup label={g.label} subtotalCents={g.subtotalCents}>
				{@render rowsFor(g.rows)}
			</MonthGroup>
		{/each}
		<Pagination
			page={data.page}
			pageSize={data.pageSize}
			total={data.total}
			{onPageChange}
			class="justify-center"
		/>
	{/if}
</PageShell>

<script lang="ts">
	/**
	 * EinnahmenListView — the flat Einnahmen list body, extracted verbatim from the
	 * list `+page.svelte` so it renders identically in two places:
	 *   - /app/einnahmen       — the real list page.
	 *   - /app/einnahmen/neu   — the Kulisse: an inert, aria-hidden backdrop behind
	 *                            the entry dialog.
	 * Presentation-only; carries NO <svelte:head> (each host owns its title).
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import StaleYearBanner from '$lib/components/admin/StaleYearBanner.svelte';
	import ListRailLayout from '$lib/components/layout/ListRailLayout.svelte';
	import FilterBar from '$lib/components/admin/transactions/FilterBar.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import EinnahmenKpi from '$lib/components/admin/transactions/einnahmen/EinnahmenKpi.svelte';
	import TransactionRow from '$lib/components/ui/TransactionRow.svelte';
	import MonthGroup from '$lib/components/ui/MonthGroup.svelte';
	import { Pagination } from '$lib/components/ui/pagination/index.js';
	import { groupByMonth } from '$lib/domain/month-group.js';
	import { formatDatumDe } from '$lib/domain/datum.js';
	import { SPHERE_LABELS, type Sphere } from '$lib/domain/sphere.js';
	import { yearScopeLabel, yearScopeMetaLabel } from '$lib/domain/year.js';
	import { listQueryString } from '$lib/domain/transaction-filters.js';
	import type { EinnahmenRow } from '$lib/server/domain/transactions.js';
	import type { EinnahmenListData } from './list-load.js';

	let { data }: { data: EinnahmenListData } = $props();

	function metaLine(row: EinnahmenRow): string {
		const sphere = SPHERE_LABELS[row.sphereSnapshot as Sphere] ?? row.sphereSnapshot;
		return `${formatDatumDe(row.gebuchtAm)} · ${sphere} · ${row.kategorieNameSnapshot}`;
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
	const yearMetaLabel = $derived(yearScopeMetaLabel(data.yearScope));
	const buchungenLabel = $derived(`${data.total} ${data.total === 1 ? 'Buchung' : 'Buchungen'}`);

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

<PageShell width="list" rail>
	<PageHeader title="Einnahmen">
		{#snippet meta()}
			<p class="tabular-nums">
				<b class="font-semibold text-ink-700">{buchungenLabel}</b> · {yearMetaLabel}
			</p>
		{/snippet}
		{#snippet toolbar()}
			<!-- ONE composed toolbar row (spec §3): the page hands its export + primary
			     action INTO the FilterBar composition, so a chip row can never nudge
			     them (Δy = 0) and the right edge stays flush with the list card. -->
			<FilterBar
				tab="einnahmen"
				state={data.filterState}
				kategorieOptions={data.kategorieOptions}
				memberOptions={data.memberOptions}
				resultCount={data.total}
				totalCount={data.kpi.count}
				{exportHref}
			>
				{#snippet pageActions()}
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<Button
						href={`/app/einnahmen/neu${listQueryString('einnahmen', $page.url.searchParams)}`}
						size="cta"
						data-slot="new-cta">Neue Einnahme</Button
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/snippet}
			</FilterBar>
		{/snippet}
	</PageHeader>

	<StaleYearBanner selectedYear={data.yearScope} currentYear={data.currentYear} />

	<ListRailLayout>
		{#snippet aside()}
			<EinnahmenKpi
				totalCents={data.kpi.totalCents}
				count={data.kpi.count}
				bySphere={data.kpi.bySphere}
				year={data.yearScope}
			/>
		{/snippet}


	{#if data.rows.length === 0}
		{#if hasActiveFilters}
			<div
				data-testid="empty-no-matches"
				class="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-(--hairline) bg-card/60 px-6 py-12 text-center"
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
				class="flex flex-col items-center gap-2 rounded-[16px] border border-dashed border-(--hairline) bg-card/60 px-6 py-12 text-center"
			>
				<p class="text-sm font-medium text-ink-700">Keine Buchungen in {yearLabel}</p>
			</div>
		{/if}
	{:else if sortOverride}
		<div class="overflow-hidden rounded-2xl border bg-card shadow-(--shadow-card)">
			<div class="divide-y divide-hairline">
				{@render rowsFor(data.rows)}
			</div>
		</div>
		<Pagination
			page={data.page}
			pageSize={data.pageSize}
			total={data.total}
			{onPageChange}
			class="justify-center"
		/>
	{:else}
		<div class="overflow-hidden rounded-2xl border bg-card shadow-(--shadow-card)">
			{#each groups as g (g.key)}
				<MonthGroup
					label={g.label}
					subtotalCents={g.subtotalCents}
					count={g.rows.length}
					cashInCents={g.rows.reduce((s, r) => s + r.betragCents, 0)}
					cashOutCents={0}
					netLabel="Netto Monat"
				>
					{@render rowsFor(g.rows)}
				</MonthGroup>
			{/each}
		</div>
		<Pagination
			page={data.page}
			pageSize={data.pageSize}
			total={data.total}
			{onPageChange}
			class="justify-center"
		/>
	{/if}
	</ListRailLayout>
</PageShell>

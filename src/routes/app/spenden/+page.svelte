<script lang="ts">
	/**
	 * /app/spenden — Spenden list (Aurora slice 5 restyle).
	 * PageShell + PageHeader single-row toolbar + month-grouped TransactionRow
	 * list. Presentation-only; the route server is unchanged. Bescheinigungs-Nr
	 * (or "Bescheinigung ausstehend") surfaces as a row chip.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import StaleYearBanner from '$lib/components/admin/StaleYearBanner.svelte';
	import FilterBar from '$lib/components/admin/transactions/FilterBar.svelte';
	import SpendenKpi from '$lib/components/admin/transactions/spenden/SpendenKpi.svelte';
	import TransactionRow from '$lib/components/ui/TransactionRow.svelte';
	import MonthGroup from '$lib/components/ui/MonthGroup.svelte';
	import { Pagination } from '$lib/components/ui/pagination/index.js';
	import { groupByMonth } from '$lib/domain/month-group.js';
	import { formatDatumDe } from '$lib/domain/datum.js';
	import { spendeArtLabel, zweckbindungLabel } from '$lib/domain/spenden-labels.js';
	import { yearScopeLabel, yearScopeMetaLabel } from '$lib/domain/year.js';
	import type { SpendenRow } from '$lib/server/domain/transactions.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	function metaLine(row: SpendenRow): string {
		return `${formatDatumDe(row.gebuchtAm)} · ${spendeArtLabel(row.spendeKind)} · ${zweckbindungLabel(row.zweckbindungKind)}`;
	}
	function chips(row: SpendenRow): { label: string; kind?: 'warn' | 'neutral' }[] {
		// The issued Bescheinigungs-Nr is a settled status → neutral; a still-open
		// "Bescheinigung ausstehend" is a to-do → warn (amber), never neutral-grey.
		return row.bescheinigungNr
			? [{ label: row.bescheinigungNr, kind: 'neutral' }]
			: [{ label: 'Bescheinigung ausstehend', kind: 'warn' }];
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
			return `/app/spenden/export${qs ? `?${qs}` : ''}`;
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
	<title>Spenden – {$page.data.vereinName}</title>
</svelte:head>

{#snippet rowsFor(rows: SpendenRow[])}
	{#each rows as row (row.id)}
		<TransactionRow
			type="spende"
			title={row.bezeichnung}
			metaLine={metaLine(row)}
			statusChips={chips(row)}
			amountCents={row.betragCents}
			signed={true}
			href={`/app/spenden/${row.id}`}
		/>
	{/each}
{/snippet}

<PageShell width="list">
	<PageHeader title="Spenden">
		{#snippet meta()}
			<p class="tabular-nums">
				<b class="font-semibold text-ink-700">{buchungenLabel}</b> · {yearMetaLabel}
			</p>
		{/snippet}
		{#snippet toolbar()}
			<!-- Mobile-first toolbar: FilterBar full-width own row; links grouped below. -->
			<div class="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
				<div class="w-full min-w-0 md:flex-1">
					<FilterBar
						tab="spenden"
						state={data.filterState}
						kategorieOptions={data.kategorieOptions}
						memberOptions={data.memberOptions}
						resultCount={data.total}
					/>
				</div>
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<div class="flex flex-wrap items-center gap-2">
					<a
						href={exportHref}
						data-testid="export-cta"
						title="Gefilterte und sortierte Liste vollständig herunterladen (alle Seiten)"
						class="inline-flex h-11 items-center rounded-[10px] border border-(--hairline) bg-card px-3 text-sm font-medium text-ink-700 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) md:h-10"
						>CSV</a
					>
					<a
						href="/app/spenden/neu"
						data-slot="new-cta"
						class="ml-auto inline-flex h-11 items-center rounded-full bg-primary-strong px-4 text-sm font-semibold text-white shadow-(--glow-brand) transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 md:ml-0 md:h-10"
						>Neue Spende</a
					>
				</div>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>
		{/snippet}
	</PageHeader>

	<StaleYearBanner selectedYear={data.yearScope} currentYear={data.currentYear} />

	<div class="mb-5">
		<SpendenKpi
			totalCents={data.kpi.totalCents}
			count={data.kpi.count}
			ohneBescheinigungCount={data.kpi.ohneBescheinigungCount}
			versandtCount={data.kpi.versandtCount}
			year={data.yearScope}
		/>
	</div>

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
				class="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-(--hairline) bg-card/60 px-6 py-12 text-center"
			>
				<span
					class="flex size-11 items-center justify-center rounded-full bg-type-spende-tint text-type-spende"
				>
					<svg
						class="size-5"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<rect width="20" height="5" x="2" y="7" rx="1" /><path d="M12 7v14" /><path
							d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"
						/><path d="M7.5 7a2.5 2.5 0 0 1 0-5C10 2 12 5.5 12 7c0-1.5 2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
					</svg>
				</span>
				<div class="space-y-1">
					<p class="text-sm font-medium text-ink-900">Noch keine Spenden in {yearLabel}</p>
					<p class="max-w-xs text-xs text-ink-500">
						Sobald du eine Spende erfasst, findest du sie hier — mit ihrem Bescheinigungs-Status.
					</p>
				</div>
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href="/app/spenden/neu"
					class="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary-strong px-4 text-sm font-semibold text-white shadow-(--glow-brand) hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2"
				>
					<svg
						class="size-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M5 12h14M12 5v14" />
					</svg>Neue Spende
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
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
</PageShell>

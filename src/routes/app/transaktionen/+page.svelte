<script lang="ts">
	/**
	 * /app/transaktionen — Aurora unified feed UI (slice 5, spec §8).
	 * PageShell list width · PageHeader with search + FilterChips in ONE
	 * toolbar row · month groups with NET signed subtotals · TransactionRow
	 * linking into the per-type detail routes. Renders identically on all
	 * viewports.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import FilterChips from '$lib/components/ui/FilterChips.svelte';
	import TransactionRow from '$lib/components/ui/TransactionRow.svelte';
	import MonthGroup from '$lib/components/ui/MonthGroup.svelte';
	import { Pagination } from '$lib/components/ui/pagination/index.js';
	import { groupByMonth } from '$lib/domain/month-group.js';
	import { SPHERE_LABELS, type Sphere } from '$lib/domain/sphere.js';
	import { statusPresentation } from '$lib/domain/transaction-status.js';
	import { yearScopeLabel } from '$lib/domain/year.js';
	import type { FeedRow } from '$lib/server/domain/transactions.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const TYP_OPTIONS = [
		{ value: '', label: 'Alle' },
		{ value: 'ausgaben', label: 'Ausgaben' },
		{ value: 'einnahmen', label: 'Einnahmen' },
		{ value: 'spenden', label: 'Spenden' },
	];
	const activeTyp = $derived(data.filterState.enums['typ']?.[0] ?? '');

	const KIND_TO_TYPE = {
		expense: 'ausgabe',
		income: 'einnahme',
		donation: 'spende',
	} as const;
	const KIND_TO_PATH = {
		expense: 'ausgaben',
		income: 'einnahmen',
		donation: 'spenden',
	} as const;

	function signedCents(r: FeedRow): number {
		return r.kind === 'expense' ? -r.betragCents : r.betragCents;
	}
	function formatDatum(isoDate: string): string {
		const [y, m, d] = isoDate.split('-');
		return `${d}.${m}.${y}`;
	}
	function metaLine(r: FeedRow): string {
		const sphere = SPHERE_LABELS[r.sphereEffective as Sphere] ?? r.sphereEffective;
		return `${formatDatum(r.relevanzDatum)} · ${sphere}`;
	}
	function chips(r: FeedRow): { label: string; kind?: 'warn' | 'neutral' }[] {
		// master §2.4 per-kind chips: only genuine incompleteness ("Beleg fehlt")
		// is 'warn'; the status label (Geprüft/Genehmigt/Erstattet) is 'neutral'.
		const out: { label: string; kind?: 'warn' | 'neutral' }[] = [];
		if (r.kind === 'expense' && r.status)
			out.push({ label: statusPresentation(r.status).label, kind: 'neutral' });
		if (r.belegFehlt) out.push({ label: 'Beleg fehlt', kind: 'warn' });
		return out;
	}

	// Feed sorts by the cash (relevanz) date — month groups follow the same axis.
	const groups = $derived(groupByMonth(data.rows, (r) => r.relevanzDatum, signedCents));

	// ── Search (?q=, debounced) — the feed's PageHeader toolbar owns search
	//    (spec §8: looking up "that one Beleg" IS the mobile use case). ──
	// Read from the URL (reactive on navigation) so the input stays in sync
	// when the server redelivers data after a chip filter change.
	let searchValue = $state($page.url.searchParams.get('q') ?? '');
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	function onSearchInput(e: Event) {
		searchValue = (e.currentTarget as HTMLInputElement).value;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(applySearch, 300);
	}
	function applySearch() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder
		const url = new URLSearchParams($page.url.search);
		const trimmed = searchValue.trim();
		if (trimmed) url.set('q', trimmed.slice(0, 200));
		else url.delete('q');
		url.delete('page');
		const search = url.toString();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same-origin query string
		goto(`${$page.url.pathname}${search ? `?${search}` : ''}`, {
			keepFocus: true,
			noScroll: true,
		});
	}

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

	// Reset link target: drop feed-owned params, keep the year selection.
	const resetHref = $derived(
		(() => {
			const year = $page.url.searchParams.get('year');
			return `${$page.url.pathname}${year ? `?year=${year}` : ''}`;
		})(),
	);
	const hasActiveFilters = $derived(!!data.filterState.search || !!activeTyp);
</script>

<svelte:head>
	<title>Transaktionen – {$page.data.vereinName}</title>
</svelte:head>

<PageShell width="list">
	<PageHeader title="Transaktionen">
		{#snippet meta()}
			<p class="text-sm text-ink-500">
				{data.total}
				{data.total === 1 ? 'Buchung' : 'Buchungen'} · {yearScopeLabel(data.yearScope)}
			</p>
		{/snippet}
		{#snippet toolbar()}
			<div class="flex w-full flex-wrap items-center gap-2">
				<input
					type="search"
					data-testid="feed-search"
					value={searchValue}
					oninput={onSearchInput}
					placeholder="Suchen…"
					aria-label="Transaktionen durchsuchen"
					autocomplete="off"
					class="h-11 w-full max-w-xs rounded-[10px] border border-(--hairline) bg-card px-3 text-sm text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) md:h-10"
				/>
				<FilterChips options={TYP_OPTIONS} active={activeTyp} paramName="typ" />
			</div>
		{/snippet}
	</PageHeader>

	{#if data.rows.length === 0}
		<div
			data-testid="feed-empty"
			class="flex flex-col items-center gap-3 rounded-[16px] border border-dashed border-(--hairline) bg-card/60 px-6 py-12 text-center"
		>
			<p class="text-sm font-medium text-ink-700">Keine Buchungen gefunden.</p>
			{#if hasActiveFilters}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={resetHref}
					class="rounded text-sm font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)"
					>Filter zurücksetzen</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	{:else}
		{#each groups as g (g.key)}
			<MonthGroup label={g.label} subtotalCents={g.subtotalCents}>
				{#each g.rows as r (r.kind + r.id)}
					<TransactionRow
						type={KIND_TO_TYPE[r.kind]}
						title={r.bezeichnung}
						metaLine={metaLine(r)}
						statusChips={chips(r)}
						amountCents={signedCents(r)}
						signed={true}
						href={`/app/${KIND_TO_PATH[r.kind]}/${r.id}`}
					/>
				{/each}
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

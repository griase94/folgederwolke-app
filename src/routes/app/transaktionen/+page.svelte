<script lang="ts">
	/**
	 * /app/transaktionen — Aurora unified feed UI (plate transaktionen-v4).
	 *
	 * Two sort lenses under one slug (spec §4.1): Datum (default — month groups
	 * with a per-month Netto + Einnahmen/Ausgaben DeltaChip on the amount ruler)
	 * and Betrag (flat rank list, largest first, Monate ausgeblendet). Both share
	 * the ledger card + a foot carrying the grand Netto over the WHOLE match set
	 * (server aggregate `sumCents`, not a per-page sum). Renders on all viewports;
	 * the mobile tab target.
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import FilterChips from '$lib/components/ui/FilterChips.svelte';
	import TransactionRow from '$lib/components/ui/TransactionRow.svelte';
	import MonthGroup from '$lib/components/ui/MonthGroup.svelte';
	import { SegmentedControl } from '$lib/components/ui/segmented-control/index.js';
	import { Pagination } from '$lib/components/ui/pagination/index.js';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { groupByMonth } from '$lib/domain/month-group.js';
	import { formatDatumDe } from '$lib/domain/datum.js';
	import { SPHERE_LABELS, type Sphere } from '$lib/domain/sphere.js';
	import { statusPresentation } from '$lib/domain/transaction-status.js';
	import { yearScopeMetaLabel } from '$lib/domain/year.js';
	import type { FeedRow } from '$lib/server/domain/transactions.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const activeTyp = $derived(data.filterState.enums['typ']?.[0] ?? '');
	// Chip order follows the plate (Alle · Einnahmen · Ausgaben · Spenden); each
	// chip carries its per-kind count over the year+search set (typ ignored).
	const TYP_OPTIONS = $derived([
		{ value: '', label: 'Alle', count: data.chipCounts.total },
		{ value: 'einnahmen', label: 'Einnahmen', count: data.chipCounts.income },
		{ value: 'ausgaben', label: 'Ausgaben', count: data.chipCounts.expense },
		{ value: 'spenden', label: 'Spenden', count: data.chipCounts.donation },
	]);

	const LENS_OPTIONS = $derived([
		{ value: 'datum', label: 'Datum', icon: lensIcon },
		{ value: 'betrag', label: 'Betrag', icon: lensIcon },
	]);
	const lens = $derived<'datum' | 'betrag'>(data.sort === 'betrag' ? 'betrag' : 'datum');

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
	function metaLine(r: FeedRow): string {
		const sphere = SPHERE_LABELS[r.sphereEffective as Sphere] ?? r.sphereEffective;
		return `${formatDatumDe(r.relevanzDatum)} · ${sphere}`;
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

	// Datum lens: month groups on the cash (relevanz) date, each carrying the
	// Einnahmen/Ausgaben split that drives the DeltaChip (income vs spending).
	function splitOf(rows: FeedRow[]): { cashInCents: number; cashOutCents: number } {
		let cashInCents = 0;
		let cashOutCents = 0;
		for (const r of rows) {
			if (r.kind === 'expense') cashOutCents += r.betragCents;
			else cashInCents += r.betragCents;
		}
		return { cashInCents, cashOutCents };
	}
	const groups = $derived(groupByMonth(data.rows, (r) => r.relevanzDatum, signedCents));

	// Foot + meta readout: whole-set totals (server aggregate), honest across pages.
	const yearMetaLabel = $derived(yearScopeMetaLabel(data.yearScope));
	const buchungenLabel = $derived(`${data.total} ${data.total === 1 ? 'Buchung' : 'Buchungen'}`);
	const monateLabel = $derived(
		`${data.monthCount} ${data.monthCount === 1 ? 'Monat' : 'Monate'}`,
	);

	// ── Search (?q=, debounced) — the feed's PageHeader toolbar owns search. ──
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
		navigate(url);
	}

	function onLensChange(value: string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder
		const url = new URLSearchParams($page.url.search);
		if (value === 'betrag') url.set('sort', 'betrag');
		else url.delete('sort');
		// The lens changes the ordering, not the match set — but reset the page
		// so the switch lands on page 1 (spec §4.1; keeps typ + q).
		url.delete('page');
		navigate(url);
	}

	function onPageChange(p: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder
		const url = new URLSearchParams($page.url.search);
		if (p <= 1) url.delete('page');
		else url.set('page', String(p));
		navigate(url);
	}

	function navigate(url: URLSearchParams) {
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

{#snippet lensIcon(value: string)}
	<svg
		class="size-4"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if value === 'betrag'}
			<path d="M4 10h12M4 14h9" />
			<path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2" />
		{:else}
			<path d="M8 2v4M16 2v4" />
			<rect width="18" height="18" x="3" y="4" rx="2" />
			<path d="M3 10h18" />
		{/if}
	</svg>
{/snippet}

{#snippet feedFoot(mode: 'datum' | 'betrag')}
	<div
		data-testid="feed-foot"
		class="grid grid-cols-[3px_34px_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 border-t border-hairline bg-secondary/40 px-1 py-3"
	>
		<div class="col-span-3 flex min-w-0 items-center gap-2 pl-1.5 text-xs text-ink-500">
			<svg
				class="size-4 flex-none text-ink-300"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13" />
			</svg>
			<span class="truncate"
				>{buchungenLabel} · {mode === 'betrag'
					? 'eine Gesamtliste'
					: monateLabel} · {yearMetaLabel}</span
			>
		</div>
		<div class="flex flex-col items-end leading-tight">
			<span class="text-[10px] font-medium text-ink-500">Netto gesamt</span>
			<span
				data-testid="feed-total"
				class="text-[13px] font-semibold tabular-nums text-ink-900"
				>{formatMoney(data.sumCents, 'always')}</span
			>
		</div>
		<span aria-hidden="true"></span>
	</div>
{/snippet}

<PageShell width="list">
	<PageHeader title="Transaktionen">
		{#snippet meta()}
			<p class="tabular-nums">
				<b class="font-semibold text-ink-700">{buchungenLabel}</b> · {yearMetaLabel}
			</p>
		{/snippet}
		{#snippet toolbar()}
			<div class="flex w-full flex-wrap items-center gap-2">
				<FilterChips options={TYP_OPTIONS} active={activeTyp} paramName="typ" />
				<input
					type="search"
					data-testid="feed-search"
					value={searchValue}
					oninput={onSearchInput}
					placeholder="Mitglied, Beleg, Betrag …"
					aria-label="Transaktionen durchsuchen"
					autocomplete="off"
					class="h-11 min-w-0 flex-1 rounded-[10px] border border-(--hairline) bg-card px-3 text-sm text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) md:h-10 md:max-w-xs"
				/>
				<div class="ml-auto flex items-center gap-2">
					<span
						class="hidden text-[11px] font-bold uppercase tracking-wider text-ink-300 sm:inline"
						>Sortieren</span
					>
					<SegmentedControl
						options={LENS_OPTIONS}
						value={lens}
						onChange={onLensChange}
						ariaLabel="Sortierung"
						data-testid="feed-lens"
					/>
				</div>
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
		<div class="overflow-hidden rounded-2xl border bg-card shadow-(--shadow-card)">
			{#if lens === 'betrag'}
				<!-- Betrag lens: flat rank list, months lifted, one grand total. -->
				<div
					data-testid="feed-flatband"
					class="flex items-center gap-2.5 border-b border-hairline bg-type-spende-tint/50 px-4 py-2.5 text-xs text-ink-700"
				>
					<svg
						class="size-4 flex-none text-type-spende"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="10" />
						<path d="M12 16v-4M12 8h.01" />
					</svg>
					<span>Nach <b class="font-semibold text-ink-900">Betrag</b> — größte zuerst, Monate ausgeblendet.</span>
				</div>
				<div class="divide-y divide-hairline">
					{#each data.rows as r, i (r.kind + r.id)}
						<TransactionRow
							type={KIND_TO_TYPE[r.kind]}
							title={r.bezeichnung}
							metaLine={metaLine(r)}
							statusChips={chips(r)}
							amountCents={signedCents(r)}
							signed={true}
							rank={(data.page - 1) * data.pageSize + i + 1}
							href={`/app/${KIND_TO_PATH[r.kind]}/${r.id}`}
						/>
					{/each}
				</div>
			{:else}
				<!-- Datum lens: month groups with per-month Netto + DeltaChip. -->
				{#each groups as g (g.key)}
					{@const split = splitOf(g.rows)}
					<MonthGroup
						label={g.label}
						subtotalCents={g.subtotalCents}
						count={g.rows.length}
						cashInCents={split.cashInCents}
						cashOutCents={split.cashOutCents}
						netLabel="Netto Monat"
					>
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
			{/if}
			{@render feedFoot(lens)}
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

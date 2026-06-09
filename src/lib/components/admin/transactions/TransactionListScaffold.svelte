<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import type { TransactionRow, BaseTxRow } from '$lib/server/domain/transactions.js';

	/**
	 * Per-tab column descriptor (Task 7 owns this type; the per-tab `columns.ts`
	 * files in Phases 4/5/6 export `ColumnDef<TabRow>[]` and bind to this shape).
	 *
	 * GENERIC over the row type `Row` (defaults to `TransactionRow` for back-compat
	 * with the Phase-3 route shells). Each tab's `listXPage` returns a `BaseTxRow`
	 * subtype (`AusgabenRow`/`EinnahmenRow`/`SpendenRow`) carrying its own columns
	 * (`status`/`belegFileId`, `rechnungBusinessId`, `spenderName`, …); declaring
	 * `ColumnDef<AusgabenRow>` lets a column's `render` snippet read those per-tab
	 * fields type-safely instead of casting `row as AusgabenRow` in every snippet.
	 *
	 *  - `key`     — the sort key emitted as `?sort=<key>` when the column header
	 *                is clicked (only meaningful when `sortable`).
	 *  - `label`   — the German column header text.
	 *  - `sortable`— when true the header is a button that toggles `?sort=&dir=`.
	 *  - `align`   — cell text alignment ("right" for money columns).
	 *  - `render`  — a Snippet receiving the row; renders the cell body. The
	 *                scaffold wraps it in a `<td>` (desktop) — the tab decides the
	 *                inner markup (badge, Money, Sphäre color-rule, link, …).
	 */
	export interface ColumnDef<Row extends BaseTxRow = TransactionRow> {
		key: string;
		label: string;
		/**
		 * Screen-reader label for columns whose visible `label` is empty (e.g.
		 * the sphäre color-rule column and the chevron/navigation column). Used
		 * as `aria-label` on the `<th>` to satisfy the `empty-table-header`
		 * a11y rule. When omitted for a visually-labeled column, the `<th>`
		 * gets no redundant `aria-label`.
		 */
		srLabel?: string;
		sortable?: boolean;
		align?: 'left' | 'right' | 'center';
		render: Snippet<[Row]>;
	}
</script>

<script lang="ts" generics="Row extends BaseTxRow = TxnRow">
	/**
	 * TransactionListScaffold — Task 7, Phase 3.
	 *
	 * The shared list shell every transaction tab (Ausgaben / Einnahmen / Spenden)
	 * renders. CONTRACT-FIRST: the prop interface below is the integration seam the
	 * Tier-C tab pages (Phases 4/5/6) bind to. It composes the already-built shared
	 * pieces — it never rebuilds them:
	 *
	 *   list header  : `{@render kpi()}` + the single primary "create" CTA (UX-01)
	 *   FilterBar    : Phase 2 chip filter-bar (state-driven, URL is source of truth)
	 *   StaleYearBanner: Task 3 amber banner for non-current concrete years
	 *   sort control : sortable column headers (desktop) / "Sortieren ▾" (mobile)
	 *                  → navigate `?sort=&dir=` via goto (keepFocus/noScroll)
	 *   rows         : `TransactionRow` (desktop <table>) / `TransactionCardMobile`
	 *                  (mobile cards), each linking `${detailHrefBase}/${row.id}`
	 *   Pagination   : Phase A3 primitive, when there is more than one page
	 *   empty states : UX-04 — two distinct zero-row cases (year-named vs no-matches)
	 */
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/stores';
	import FilterBar from './FilterBar.svelte';
	import StaleYearBanner from '$lib/components/admin/StaleYearBanner.svelte';
	import TransactionCardMobile from './TransactionCardMobile.svelte';
	import { Pagination } from '$lib/components/ui/pagination/index.js';
	import {
		serializeFilterState,
		type FilterState,
		type TabKey,
	} from '$lib/domain/transaction-filters.js';
	import type { TransactionRow as TxnRow } from '$lib/server/domain/transactions.js';
	import type { YearScope } from '$lib/domain/year.js';
	import { yearScopeLabel } from '$lib/domain/year.js';
	// `Snippet` + `BaseTxRow` are imported in the module <script> above and are in
	// scope here (incl. for the `generics` attribute on the instance <script> tag).
	// `Row` is the generics param — the per-tab BaseTxRow subtype; `TxnRow` is the
	// back-compat default for the Phase-3 shells.

	interface Props {
		tab: TabKey;
		/** Already server-filtered + paginated rows (the per-tab `listXPage`). */
		rows: Row[];
		/** Total matching rows across all pages (drives pagination). */
		total: number;
		page: number;
		pageSize: number;
		/** Year scope for the list — concrete year or the ALL_YEARS sentinel. */
		selectedYear: YearScope;
		currentYear: number;
		filterState: FilterState;
		/** P2-04: `value` = kategorie NAME-SNAPSHOT string (NOT the id). */
		kategorieOptions: { value: string; label: string }[];
		memberOptions: { id: string; label: string }[];
		/** Per-tab column config (label, key, sortable, align, render snippet). */
		columns: ColumnDef<Row>[];
		/** Per-tab KPI strip (Ausgaben pill / Einnahmen split / Spenden bescheinigung). */
		kpi: Snippet;
		/** UX-01: primary create CTA target, e.g. "/app/ausgaben/neu". */
		newHref: string;
		/** UX-01: German CTA label, e.g. "Neue Ausgabe". */
		newLabel: string;
		/** e.g. "/app/ausgaben" — detail href base; each row links `${base}/${id}`. */
		detailHrefBase: string;
		/** Ausgaben only — bulk-select wiring + the bulk action bar snippet. */
		bulk?: {
			selectedIds: string[];
			onToggle: (id: string) => void;
			bar: Snippet;
		};
		/** Optional per-tab override for the no-rows-no-filters empty state. */
		emptyState?: Snippet;
	}

	let {
		tab,
		rows,
		total,
		page: pageNum,
		pageSize,
		selectedYear,
		currentYear,
		filterState,
		kategorieOptions,
		memberOptions,
		columns,
		kpi,
		newHref,
		newLabel,
		detailHrefBase,
		bulk,
		emptyState,
	}: Props = $props();

	// ── Filter activity (UX-04) ──────────────────────────────────────────────
	// Mirrors FilterBar's notion of "active": a search term OR any selected
	// enum/member/amount/boolean. Drives which zero-row empty state we show and
	// whether the FilterBar exposes a reset affordance.
	const hasActiveFilters = $derived(
		!!filterState.search ||
			Object.values(filterState.enums).some((v) => v.length > 0) ||
			Object.keys(filterState.members).length > 0 ||
			filterState.amount.betragMin != null ||
			filterState.amount.betragMax != null ||
			Object.values(filterState.booleans).some(Boolean),
	);

	// Year label for the year-named empty state — handles the ALL_YEARS sentinel
	// via the SHARED helper so it matches the tab KPIs (item 6).
	const yearLabel = $derived(yearScopeLabel(selectedYear));

	// ── Sort (read off the URL; emit via goto) ─────────────────────────────────
	const currentSort = $derived($page.url.searchParams.get('sort'));
	const currentDir = $derived($page.url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc');

	/** aria-sort value for a column header given the active URL sort. */
	function ariaSortFor(key: string): 'ascending' | 'descending' | 'none' {
		if (currentSort !== key) return 'none';
		return currentDir === 'desc' ? 'descending' : 'ascending';
	}

	/** Clicking a sortable header toggles asc⇄desc for that key (or starts asc). */
	function onSort(key: string) {
		const nextDir = currentSort === key && currentDir === 'asc' ? 'desc' : 'asc';
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder, not a reactive store
		const url = new URLSearchParams($page.url.search);
		url.set('sort', key);
		url.set('dir', nextDir);
		// A sort change can move the active row off the current page slice; reset.
		url.delete('page');
		const search = url.toString();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic same-origin query string, not a typed route id
		goto(`${$page.url.pathname}${search ? `?${search}` : ''}`, {
			keepFocus: true,
			noScroll: true,
		});
	}

	// ── Pagination (emit ?page= via goto) ──────────────────────────────────────
	function onPageChange(p: number) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder, not a reactive store
		const url = new URLSearchParams($page.url.search);
		if (p <= 1) url.delete('page');
		else url.set('page', String(p));
		const search = url.toString();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic same-origin query string, not a typed route id
		goto(`${$page.url.pathname}${search ? `?${search}` : ''}`, {
			keepFocus: true,
			noScroll: true,
		});
	}

	// ── Mobile sort control ─────────────────────────────────────────────────────
	const sortableColumns = $derived(columns.filter((c) => c.sortable));

	function onMobileSort(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		if (value) onSort(value);
	}

	// ── T3: Export CTA ─────────────────────────────────────────────────────────
	// href = /app/<tab>/export?<current query> — carries the active filter+sort
	// so the server renders the same filtered+sorted set across ALL pages.
	const exportHref = $derived(
		(() => {
			const qs = $page.url.searchParams.toString();
			return `/app/${tab}/export${qs ? `?${qs}` : ''}`;
		})()
	);

	// Pending state while the CSV streams — toggled on click, cleared when the
	// browser fires the download link's load event. Kept simple: `aria-busy` is
	// enough; no complex promise wiring needed for a streaming download link.
	let exportPending = $state(false);

	function onExportClick() {
		if (total === 0) return;
		exportPending = true;
		// Reset after a short delay — the download happens off-page (no network
		// event fires for a <a href> click), so we just clear the spinner quickly.
		setTimeout(() => {
			exportPending = false;
		}, 1500);
	}

	// ── UX-04 reset: clear all filters → navigate to the unfiltered list ────────
	function resetFilters() {
		const qs = serializeFilterState(tab, {
			enums: {},
			members: {},
			amount: {},
			booleans: {},
		});
		// Preserve non-filter params (year/sort/dir), drop the page (result set changed).
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder, not a reactive store
		const current = new URLSearchParams($page.url.search);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local key set, not a reactive store
		const ownedKeys = new Set<string>(['q', 'betragMin', 'betragMax', 'page']);
		for (const k of Object.keys(filterState.enums)) ownedKeys.add(k);
		for (const k of Object.keys(filterState.members)) ownedKeys.add(k);
		for (const k of Object.keys(filterState.booleans)) ownedKeys.add(k);
		for (const k of ownedKeys) current.delete(k);
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder, not a reactive store
		const merged = new URLSearchParams(qs);
		for (const [k, v] of current) merged.set(k, v);
		const search = merged.toString();
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic same-origin query string, not a typed route id
		goto(`${$page.url.pathname}${search ? `?${search}` : ''}`, {
			keepFocus: true,
			noScroll: true,
		});
	}
</script>

<div class="flex flex-col gap-4">
	<!-- ── List header: KPI strip + the single primary "create" CTA (UX-01) ─── -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0 flex-1">
			{@render kpi()}
		</div>
		<!-- Desktop: primary CTA + export CTA top-right of the header. -->
		<div class="hidden shrink-0 items-center gap-2 sm:flex">
			<!-- T3: Export CTA — exports the full filtered+sorted set across all pages. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={exportHref}
				data-slot="export-cta"
				data-testid="export-cta"
				aria-disabled={total === 0 || undefined}
				aria-busy={exportPending || undefined}
				onclick={total === 0 ? (e) => e.preventDefault() : onExportClick}
				title="Gefilterte und sortierte Liste vollständig herunterladen (alle Seiten)"
				class={[
					'inline-flex h-11 min-h-11 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-4 text-sm font-medium transition-colors',
					total === 0
						? 'cursor-not-allowed opacity-50'
						: 'hover:bg-accent',
				].join(' ')}
			>
				{#if exportPending}
					<span
						aria-hidden="true"
						class="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
					></span>
				{/if}
				Gefilterte Liste als CSV
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={newHref}
				data-slot="new-cta"
				class="inline-flex h-11 min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
			>
				{newLabel}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	</div>

	<!-- ── Stale-year banner (Task 3) ───────────────────────────────────────── -->
	<StaleYearBanner {selectedYear} {currentYear} />

	<!-- ── Filter bar (Phase 2) ─────────────────────────────────────────────── -->
	<FilterBar
		{tab}
		state={filterState}
		{kategorieOptions}
		{memberOptions}
		resultCount={total}
	/>

	<!-- ── T4 Loading skeleton: shown while navigating to a new filter/sort/page ──
	     Gated on the `navigating` store (not a wall-clock timer) so it only
	     appears during real SvelteKit navigations; vanishes once settled. -->
	{#if $navigating}
		<div data-testid="list-skeleton" aria-busy="true" aria-label="Wird geladen…" class="flex flex-col gap-2">
			{#each Array(5) as _, i (i)}
				<div class="h-12 animate-pulse rounded-lg bg-muted"></div>
			{/each}
		</div>
	{/if}

	<!-- ── Bulk action bar (Ausgaben only) ──────────────────────────────────── -->
	{#if bulk}
		{@render bulk.bar()}
	{/if}

	<!-- ── Mobile sort control ──────────────────────────────────────────────── -->
	{#if sortableColumns.length}
		<div class="md:hidden">
			<label class="flex items-center gap-2 text-sm text-muted-foreground">
				<span>Sortieren</span>
				<span aria-hidden="true">▾</span>
				<select
					aria-label="Sortieren nach"
					class="h-11 min-h-11 flex-1 rounded-md border border-border bg-background px-3 text-sm"
					value={currentSort ?? ''}
					onchange={onMobileSort}
				>
					<option value="">—</option>
					{#each sortableColumns as col (col.key)}
						<option value={col.key}>{col.label}</option>
					{/each}
				</select>
			</label>
		</div>
	{/if}

	{#if rows.length === 0}
		<!-- ── UX-04: two distinct zero-row empty states ────────────────────── -->
		{#if hasActiveFilters}
			<div
				data-testid="empty-no-matches"
				class="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center"
			>
				<p class="text-sm font-medium text-foreground">
					Keine Treffer für die aktuellen Filter
				</p>
				<button
					type="button"
					onclick={resetFilters}
					class="inline-flex h-11 min-h-11 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
				>
					Filter zurücksetzen
				</button>
			</div>
		{:else if emptyState}
			{@render emptyState()}
		{:else}
			<div
				data-testid="empty-year"
				class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center"
			>
				<p class="text-sm font-medium text-foreground">
					Keine Buchungen in {yearLabel}
				</p>
			</div>
		{/if}
	{:else}
		<!-- ── Desktop table (md+) ──────────────────────────────────────────── -->
		<div class="hidden overflow-x-auto md:block">
			<table data-testid="transactions-table" class="w-full border-collapse text-sm">
				<thead>
					<tr class="border-b border-border text-left text-xs text-muted-foreground">
						{#each columns as col (col.key)}
							<th
								scope="col"
								aria-sort={col.sortable ? ariaSortFor(col.key) : undefined}
								aria-label={col.srLabel ?? undefined}
								class={[
									'px-3 py-2 font-medium',
									col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
								].join(' ')}
							>
								{#if col.sortable}
									<!-- T5 a11y: native <button> is keyboard-operable (Enter/Space) by default.
									     min-h-11 ensures ≥44 px tap target; focus-visible ring provides
									     clear keyboard-focus indication. -->
									<button
										type="button"
										onclick={() => onSort(col.key)}
										class="inline-flex min-h-11 items-center gap-1 rounded px-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										{col.label}
										{#if currentSort === col.key}
											<span aria-hidden="true">{currentDir === 'desc' ? '▾' : '▴'}</span>
										{/if}
									</button>
								{:else if col.srLabel && !col.label}
									<!-- Visual-only column (e.g. sphäre color-rule, chevron): provide
									     screen-reader text via visually-hidden span so axe's
									     empty-table-header rule is satisfied. -->
									<span class="sr-only">{col.srLabel}</span>
								{:else}
									{col.label}
								{/if}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						<tr class="border-b border-border last:border-0 hover:bg-muted/40" data-testid="scaffold-row">
							{#each columns as col (col.key)}
								<td
									class={[
										'px-3 py-3 align-top',
										col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
									].join(' ')}
								>
									{@render col.render(row)}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- ── Mobile cards (<md) ────────────────────────────────────────────── -->
		<div data-testid="transactions-card-list" class="flex flex-col gap-2 md:hidden">
			{#each rows as row (row.id)}
				<!-- The card row is typed `BaseTxRow & {optional per-tab fields}`, so the
				     generic `Row` (a BaseTxRow subtype) passes directly — no cast — and
				     the card can surface this tab's scan signal (Einnahmen aus-Rechnung
				     / Spenden Bescheinigung) from the per-tab columns it carries. -->
				<TransactionCardMobile
					{row}
					selected={bulk ? bulk.selectedIds.includes(row.id) : false}
					ontoggle={bulk ? bulk.onToggle : () => {}}
					detailHref={`${detailHrefBase}/${row.id}`}
					selectable={!!bulk}
					showKindPill={false}
				/>
			{/each}
		</div>

		<!-- ── Pagination (Phase A3 primitive) ──────────────────────────────── -->
		<Pagination page={pageNum} {pageSize} {total} {onPageChange} class="justify-center" />
	{/if}

	<!-- ── Mobile sticky create CTA / FAB (UX-01, min 44px touch target) ─────
	     AT-reachable: a real link with an accessible name (`aria-label={newLabel}`)
	     and a visible "+" glyph. This is the mobile counterpart to the desktop
	     top-right CTA above (which is display:none on mobile); the FAB is hidden
	     on sm+ so exactly one create action is reachable per breakpoint. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		href={newHref}
		data-slot="new-cta-mobile"
		aria-label={newLabel}
		class="fixed right-4 bottom-20 z-30 inline-flex h-14 min-h-14 w-14 min-w-14 items-center justify-center rounded-full bg-primary text-2xl leading-none text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 sm:hidden"
	>
		<span aria-hidden="true">+</span>
	</a>
</div>

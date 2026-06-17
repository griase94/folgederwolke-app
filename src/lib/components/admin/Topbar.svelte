<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { SvelteMap } from 'svelte/reactivity';
	import UserMenu from './UserMenu.svelte';
	import YearMenu, { type YearMenuOption } from './YearMenu.svelte';
	import type { SessionUser } from '$lib/server/auth/index.js';
	import { ALL_YEARS, type YearScope } from '$lib/domain/year.js';
	import InstallPrompt from '$lib/components/pwa/InstallPrompt.svelte';
	import type { SearchResponse, SearchResult } from '../../../routes/api/search/+server.js';

	interface Props {
		user: SessionUser;
	}

	let { user }: Props = $props();

	// ── Year switcher (C2 — VB-002 / JB-001 / UX-010 / UI-009) ───────────────
	//
	// Data flows from /app/+layout.server.ts → $page.data. We read it
	// reactively so route changes (including filter swaps via the switcher
	// itself) update the rendered control without explicit prop threading.
	//
	// Persistence: the selected year is mirrored to a server-readable cookie
	// (fdw_year) so a returning user lands on their year even on plain
	// navigations without ?year= in the URL. The URL remains the source of
	// truth for the current navigation. Cookie is written from the browser
	// before goto() so the server resolves the same year on the next SSR
	// request (no flash of the default year).

	const YEAR_COOKIE = 'fdw_year';
	const YEAR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

	const yearData = $derived(() => {
		const d = $page.data as Record<string, unknown>;
		const availableYears = (d['availableYears'] ?? []) as YearMenuOption[];
		const selectedYear = (d['selectedYear'] as number | undefined) ?? null;
		// yearScope (Task 2) is the wider YearScope — `number | ALL_YEARS`. The
		// menu highlights "Alle Jahre" when this is the "all" sentinel; for
		// concrete years it equals selectedYear.
		const yearScope = (d['yearScope'] as YearScope | undefined) ?? null;
		const currentYear = (d['currentYear'] as number | undefined) ?? null;
		return { availableYears, selectedYear, yearScope, currentYear };
	});

	// "Alle Jahre" is a lists-only scope (spec §6) — the option appears only on
	// the three transaction list routes and is invisible everywhere else.
	const allowAllYears = $derived(
		/^\/app\/(ausgaben|einnahmen|spenden)(\/|$)/.test($page.url.pathname)
	);

	function persistYearCookie(year: number) {
		// Write the year cookie so the server can resolve it on next navigation.
		// document.cookie is acceptable here — this is a non-sensitive UI pref
		// (mirrors the theme cookie pattern). The server validates it against
		// availableYears before trusting it.
		try {
			document.cookie = `${YEAR_COOKIE}=${year}; path=/; max-age=${YEAR_COOKIE_MAX_AGE}; samesite=lax`;
		} catch {
			// Unlikely — ignore if cookie API unavailable.
		}
	}

	function handleYearChange(year: YearScope) {
		// "all" sentinel: navigate to ?year=all verbatim — do NOT persist to
		// the cookie (it's a list-only view, not a year we want to restore on
		// next visit). Numeric years keep the existing persist + navigate path.
		if (year === ALL_YEARS) {
			const u = new URL($page.url);
			u.searchParams.set('year', ALL_YEARS);
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto(u.pathname + u.search, { keepFocus: true, noScroll: true });
			return;
		}
		// Write cookie BEFORE goto so the server sees it on the next SSR request.
		persistYearCookie(year);
		// Mutate ?year= on the current path; preserve every other query param
		// (search, filter, kind, …) so the user's view context survives.
		const u = new URL($page.url);
		u.searchParams.set('year', String(year));
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(u.pathname + u.search, { keepFocus: true, noScroll: true });
	}

	// NOTE: The localStorage restore $effect was removed. Year persistence is now
	// handled via the fdw_year cookie resolved server-side in
	// /app/+layout.server.ts — eliminates the 2025→2026 flicker that occurred
	// when the $effect ran client-side AFTER the server had already rendered the
	// default year.

	// ── Search ───────────────────────────────────────────────────────────────
	const RECENT_KEY = 'fdw.search.recent';
	const RECENT_MAX = 5;
	const DEBOUNCE_MS = 175;

	let searchInput = $state<HTMLInputElement | null>(null);
	let searchValue = $state('');
	let searchOpen = $state(false);
	let searchResults = $state<SearchResponse['results'] | null>(null);
	let searchLoading = $state(false);
	let highlightIndex = $state(-1);

	// Persisted recent queries (lazy-loaded on first open)
	let recentQueries = $state<string[]>([]);

	function loadRecents(): string[] {
		try {
			return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
		} catch {
			return [];
		}
	}

	function saveRecent(q: string) {
		const trimmed = q.trim();
		if (!trimmed) return;
		const list = loadRecents().filter((r) => r !== trimmed);
		list.unshift(trimmed);
		const next = list.slice(0, RECENT_MAX);
		try {
			localStorage.setItem(RECENT_KEY, JSON.stringify(next));
		} catch {
			// localStorage may be unavailable in some contexts
		}
		recentQueries = next;
	}

	// Flat list of all result items for keyboard nav
	const flatResults = $derived((): SearchResult[] => {
		if (!searchResults) return [];
		return [
			...searchResults.members,
			...searchResults.customers,
			...searchResults.expenses,
			...searchResults.invoices,
			...searchResults.projects,
		];
	});

	// Grouped display list: [{ group, items }]
	const groupedResults = $derived((): { group: string; items: SearchResult[] }[] => {
		if (!searchResults) return [];
		const groups: { group: string; items: SearchResult[] }[] = [
			{ group: 'Mitglieder', items: searchResults.members },
			{ group: 'Kunden', items: searchResults.customers },
			{ group: 'Auslagen', items: searchResults.expenses },
			{ group: 'Rechnungen', items: searchResults.invoices },
			{ group: 'Projekte', items: searchResults.projects },
		];
		return groups.filter((g) => g.items.length > 0);
	});

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	async function runSearch(q: string) {
		searchLoading = true;
		highlightIndex = -1;
		try {
			const res = await fetch('/api/search?q=' + encodeURIComponent(q));
			if (res.ok) {
				const data: SearchResponse = await res.json();
				searchResults = data.results;
				// Persist query as recent if any results returned
				const total = flatResults().length;
				if (total > 0) saveRecent(q);
			}
		} catch {
			// Network error — leave previous results visible
		} finally {
			searchLoading = false;
		}
	}

	function handleInput() {
		const q = searchValue.trim();
		if (debounceTimer) clearTimeout(debounceTimer);
		if (!q) {
			searchResults = null;
			searchLoading = false;
			highlightIndex = -1;
			return;
		}
		debounceTimer = setTimeout(() => runSearch(q), DEBOUNCE_MS);
	}

	function handleFocus() {
		recentQueries = loadRecents();
		searchOpen = true;
	}

	function handleBlur() {
		// Delay close so clicks inside the popover register first
		setTimeout(() => {
			if (!searchInput?.closest('.fdw-search-wrap')?.contains(document.activeElement)) {
				searchOpen = false;
			}
		}, 150);
	}

	function closeSearch() {
		searchOpen = false;
		highlightIndex = -1;
	}

	function clearSearch() {
		searchValue = '';
		searchResults = null;
		searchLoading = false;
		highlightIndex = -1;
		searchInput?.focus();
	}

	function navigateTo(href: string) {
		closeSearch();
		searchValue = '';
		searchResults = null;
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(href);
	}

	function applyRecent(q: string) {
		searchValue = q;
		void runSearch(q);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!searchOpen) return;
		const items = flatResults();
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlightIndex = Math.min(highlightIndex + 1, items.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightIndex = Math.max(highlightIndex - 1, -1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const target = highlightIndex >= 0 ? items[highlightIndex] : items[0];
			if (target) navigateTo(target.href);
		} else if (e.key === 'Escape') {
			closeSearch();
			searchInput?.blur();
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			searchInput?.focus();
		}
	}

	// Precomputed flat index per result id, for keyboard highlight matching
	const flatIndexMap = $derived((): SvelteMap<string, number> => {
		const m = new SvelteMap<string, number>();
		let i = 0;
		for (const g of groupedResults()) {
			for (const item of g.items) {
				m.set(item.id, i++);
			}
		}
		return m;
	});

	// True when there is text in the search input (controls clear-✕ / ⌘K visibility)
	const hasSearchText = $derived(searchValue.length > 0);
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<!--
	Aurora topbar (spec §5): ONE row — year menu left, search + user menu
	right (desktop); year pill left + avatar right on one baseline (mobile,
	no global search at launch). Glass is allowed: small fixed surface
	(spec §2 blur discipline). Breadcrumbs are gone — PageHeader's mobile
	back slot and the sidebar carry orientation now.
-->
<header
	class="safe-top sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-hairline surface-glass px-4 lg:px-6"
>
	<!-- Year menu (spec §5: leftmost on both devices) — compact dropdown,
	     same on desktop and mobile (no more two-variant responsive switch) -->
	{#if yearData().availableYears.length > 0 && yearData().selectedYear !== null}
		<div data-fdw="year-switcher-wrap">
			<YearMenu
				years={yearData().availableYears}
				selected={yearData().yearScope ?? yearData().selectedYear!}
				onChange={handleYearChange}
				{allowAllYears}
			/>
		</div>
	{/if}

	<!-- Spacer: pushes search + user menu to the right edge -->
	<div class="flex-1" aria-hidden="true"></div>

	<span class="hidden" data-testid="verein-wordmark">{$page.data.vereinName}</span>

	<!-- Search input (desktop) -->
	<div class="fdw-search-wrap relative hidden w-64 md:block xl:w-80">
		<div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-muted-foreground"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.35-4.35" />
			</svg>
		</div>
		<input
			bind:this={searchInput}
			bind:value={searchValue}
			type="search"
			placeholder="Mitglied, Auslage, Rechnung suchen…"
			class="h-9 w-full rounded-lg border border-hairline bg-muted/40 py-2 pl-9 pr-16 text-base placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm"
			aria-label="Admin-Suche"
			aria-expanded={searchOpen}
			aria-controls="fdw-search-listbox"
			aria-autocomplete="list"
			role="combobox"
			autocomplete="off"
			oninput={handleInput}
			onfocus={handleFocus}
			onblur={handleBlur}
			onkeydown={handleKeydown}
		/>

		<!-- Trailing affordances: ⌘K hint (empty) XOR clear-✕ button (has text) -->
		{#if hasSearchText}
			<!-- Clear button: ≥32px tap target, vertically centered, right-aligned -->
			<button
				type="button"
				onclick={clearSearch}
				class="absolute inset-y-0 right-2 flex h-full min-w-[2rem] items-center justify-center px-1 text-ink-500 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				aria-label="Suche zurücksetzen"
				tabindex="-1"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		{:else}
			<kbd
				class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-medium text-muted-foreground"
				aria-hidden="true"
			>
				⌘K
			</kbd>
		{/if}

		<!-- Results / recents popover -->
		{#if searchOpen}
			<div
				id="fdw-search-listbox"
				role="listbox"
				tabindex="-1"
				class="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-80 overflow-y-auto rounded-xl border border-border bg-background shadow-lg"
				onmousedown={(e) => e.preventDefault()}
			>
				{#if searchValue.trim().length === 0}
					<!-- Recent searches -->
					{#if recentQueries.length > 0}
						<div class="px-3 pb-1 pt-2">
							<p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
								Zuletzt gesucht
							</p>
						</div>
						{#each recentQueries as q (q)}
							<button
								type="button"
								class="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
								onclick={() => applyRecent(q)}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="13"
									height="13"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="shrink-0 text-muted-foreground"
									aria-hidden="true"
								>
									<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
									<path d="M3 3v5h5" />
									<path d="M12 7v5l4 2" />
								</svg>
								<span class="truncate text-foreground">{q}</span>
							</button>
						{/each}
					{:else}
						<p class="px-3 py-4 text-center text-sm text-muted-foreground">
							Gib einen Suchbegriff ein…
						</p>
					{/if}
				{:else if searchLoading}
					<p class="px-3 py-4 text-center text-sm text-muted-foreground">Suche…</p>
				{:else if groupedResults().length === 0}
					<p class="px-3 py-4 text-center text-sm text-muted-foreground">
						Keine Ergebnisse für „{searchValue.trim()}"
					</p>
				{:else}
					<!-- Grouped results with keyboard highlight tracking -->
					{#each groupedResults() as group (group.group)}
						<div class="px-3 pb-1 pt-2">
							<p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
								{group.group}
							</p>
						</div>
						{#each group.items as item (item.id)}
							{@const itemIndex = flatIndexMap().get(item.id) ?? -1}
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={item.href}
								role="option"
								aria-selected={highlightIndex === itemIndex}
								class="flex flex-col gap-0.5 px-3 py-2 transition-colors hover:bg-muted {highlightIndex === itemIndex ? 'bg-muted' : ''}"
								onclick={(e) => { e.preventDefault(); navigateTo(item.href); }}
							>
								<span class="truncate text-sm font-medium text-foreground">{item.label}</span>
								{#if item.sublabel}
									<span class="truncate text-xs text-muted-foreground">{item.sublabel}</span>
								{/if}
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/each}
					{/each}
				{/if}
			</div>
		{/if}
	</div>

	<!--
		No mobile (<md) search affordance: there is no mobile search backend, so
		a tappable icon here would be a dead no-op. The desktop search above
		(`hidden md:block`) covers ≥md; mobile users reach entities via the
		bottom tab bar + list filters.
	-->

	<!--
		Notification bell removed: no notifications feature exists, so a disabled
		"demnächst" bell only added visual noise and a non-actionable control.
		Reinstate a real bell here once the feature ships.
	-->

	<!-- PWA install prompt (Android / Chrome — hidden until beforeinstallprompt fires) -->
	<InstallPrompt />

	<!-- User menu -->
	<UserMenu {user} />
</header>

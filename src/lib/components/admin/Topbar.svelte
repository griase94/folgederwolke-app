<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { SvelteMap } from 'svelte/reactivity';
	import UserMenu from './UserMenu.svelte';
	import YearSwitcher, { type YearSwitcherOption } from './YearSwitcher.svelte';
	import MobileYearPicker from './MobileYearPicker.svelte';
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
	// Persistence: the last-selected year is mirrored to localStorage so a
	// returning user lands on their year even when they bookmark `/app`. The
	// URL remains the source of truth for the current navigation.
	const YEAR_LS_KEY = 'fdw.year.selected';

	const yearData = $derived(() => {
		const d = $page.data as Record<string, unknown>;
		const availableYears = (d['availableYears'] ?? []) as YearSwitcherOption[];
		const selectedYear = (d['selectedYear'] as number | undefined) ?? null;
		// yearScope (Task 2) is the wider YearScope — `number | ALL_YEARS`. The
		// switcher highlights "Alle Jahre" when this is the "all" sentinel; for
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

	function persistYear(year: number) {
		try {
			localStorage.setItem(YEAR_LS_KEY, String(year));
		} catch {
			// Storage unavailable (Safari private mode etc.) — ignore.
		}
	}

	function handleYearChange(year: YearScope) {
		// "all" sentinel: navigate to ?year=all verbatim — do NOT persist to
		// localStorage (it's a list-only view, not a year we want to restore on
		// next visit). Numeric years keep the existing persist + navigate path.
		if (year === ALL_YEARS) {
			const u = new URL($page.url);
			u.searchParams.set('year', ALL_YEARS);
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto(u.pathname + u.search, { keepFocus: true, noScroll: true });
			return;
		}
		persistYear(year);
		// Mutate ?year= on the current path; preserve every other query param
		// (search, filter, kind, …) so the user's view context survives.
		const u = new URL($page.url);
		u.searchParams.set('year', String(year));
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(u.pathname + u.search, { keepFocus: true, noScroll: true });
	}

	// On first mount, if the URL has no ?year but localStorage has a value
	// different from the server-derived default, swap it in. This is the
	// "year persists across hard reload" behaviour the E2E asserts.
	$effect(() => {
		if (typeof window === 'undefined') return;
		const hasUrlYear = $page.url.searchParams.has('year');
		if (hasUrlYear) return;
		let stored: string | null;
		try {
			stored = localStorage.getItem(YEAR_LS_KEY);
		} catch {
			return;
		}
		if (!stored) return;
		const n = Number.parseInt(stored, 10);
		const data = yearData();
		if (!Number.isFinite(n)) return;
		if (data.selectedYear === n) return;
		// Only restore if the stored year is in availableYears — otherwise
		// the user's stale localStorage value would silently land them on a
		// year that doesn't exist.
		const present = data.availableYears.some((y) => y.year === n);
		if (!present) return;
		const u = new URL($page.url);
		u.searchParams.set('year', String(n));
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(u.pathname + u.search, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	});

	// ── Breadcrumbs ──────────────────────────────────────────────────────────
	interface Crumb {
		label: string;
		href: string;
	}

	const ROUTE_LABELS: Record<string, string> = {
		app: 'Übersicht',
		inbox: 'Audit Inbox',
		transactions: 'Transaktionen',
		ausgaben: 'Ausgaben',
		einnahmen: 'Einnahmen',
		spenden: 'Spenden',
		mitglieder: 'Mitglieder',
		rechnungen: 'Rechnungen',
		projekte: 'Projekte',
		kunden: 'Kunden',
		jahresabschluss: 'Jahresabschluss',
		einstellungen: 'Einstellungen',
		dsgvo: 'DSGVO',
		dev: 'Dev',
		mails: 'Mails',
		neu: 'Neu',
	};

	const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	const breadcrumbs = $derived((): Crumb[] => {
		const segments = $page.url.pathname.replace(/^\//, '').split('/');
		const crumbs: Crumb[] = [];
		let accumulated = '';
		for (const seg of segments) {
			accumulated += '/' + seg;
			if (UUID_RE.test(seg)) {
				// UUID segment: use member name from page data if available, otherwise omit.
				const pageData = $page.data as Record<string, unknown>;
				const member = pageData['member'] as
					| { vorname?: string; nachname?: string }
					| null
					| undefined;
				if (member?.vorname || member?.nachname) {
					const label = [member.vorname, member.nachname].filter(Boolean).join(' ');
					crumbs.push({ label, href: accumulated });
				}
				// else: omit UUID segment entirely
			} else {
				const label = ROUTE_LABELS[seg] ?? seg;
				crumbs.push({ label, href: accumulated });
			}
		}
		return crumbs;
	});

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
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<header
	class="safe-top sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 lg:px-6"
>
	<!-- Breadcrumbs -->
	<nav aria-label="Breadcrumb" class="hidden flex-1 items-center gap-1 text-sm sm:flex">
		{#each breadcrumbs() as crumb, i (crumb.href)}
			{#if i > 0}
				<span class="text-muted-foreground" aria-hidden="true">/</span>
			{/if}
			{#if i === breadcrumbs().length - 1}
				<span class="font-medium text-foreground">{crumb.label}</span>
			{:else}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={crumb.href}
					class="text-muted-foreground transition-colors hover:text-foreground"
				>
					{crumb.label}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		{/each}
	</nav>

	<!--
		Mobile (PM-010 / C7-3): hide the Vereinsname wordmark on mobile so the
		topbar gets back its horizontal space — there's no room for it next to
		the search-icon + bell + user-menu at iPhone width. The breadcrumb
		nav above already takes over from `sm:` upwards.
	-->
	<span class="hidden">Folge der Wolke</span>

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
			class="h-9 w-full rounded-lg border border-border bg-muted/40 py-2 pl-9 pr-16 text-base placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 sm:text-sm"
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
		<kbd
			class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-medium text-muted-foreground"
			aria-hidden="true"
		>
			⌘K
		</kbd>

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

	<!-- Mobile search icon (opens full-screen overlay — Phase 6) -->
	<button
		type="button"
		class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
		aria-label="Suche öffnen"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="8" />
			<path d="m21 21-4.35-4.35" />
		</svg>
	</button>

	<!-- Year switcher (C2 — sticky in topbar) -->
	{#if yearData().availableYears.length > 0 && yearData().selectedYear !== null}
		<!-- Desktop variant (>= sm): SegmentedControl with one segment per year. -->
		<div class="fdw-year-switcher-wrap hidden sm:block" data-fdw="year-switcher-wrap">
			<YearSwitcher
				years={yearData().availableYears}
				selected={yearData().yearScope ?? yearData().selectedYear!}
				onChange={handleYearChange}
				{allowAllYears}
			/>
		</div>
		<!--
			Mobile variant (< sm, C2-4): native <select> picker. Renders ONLY
			below sm so the desktop SegmentedControl remains the default once
			there's horizontal space for it. Both variants share the same
			?year= URL contract via handleYearChange.
		-->
		<div class="sm:hidden">
			<MobileYearPicker
				years={yearData().availableYears}
				selected={yearData().yearScope ?? yearData().selectedYear!}
				onChange={handleYearChange}
				{allowAllYears}
			/>
		</div>
	{/if}

	<!-- Notification bell stub -->
	<button
		type="button"
		class="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		aria-label="Benachrichtigungen (demnächst)"
		disabled
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
			<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
		</svg>
	</button>

	<!-- PWA install prompt (Android / Chrome — hidden until beforeinstallprompt fires) -->
	<InstallPrompt />

	<!-- User menu -->
	<UserMenu {user} />
</header>

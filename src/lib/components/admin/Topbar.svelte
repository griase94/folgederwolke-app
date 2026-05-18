<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { SvelteMap } from 'svelte/reactivity';
	import UserMenu from './UserMenu.svelte';
	import type { SessionUser } from '$lib/server/auth/index.js';
	import type { SearchResponse, SearchResult } from '../../../routes/api/search/+server.js';

	interface Props {
		user: SessionUser;
	}

	let { user }: Props = $props();

	// ── Breadcrumbs ──────────────────────────────────────────────────────────
	interface Crumb {
		label: string;
		href: string;
	}

	const ROUTE_LABELS: Record<string, string> = {
		app: 'Start',
		inbox: 'Audit Inbox',
		transactions: 'Transaktionen',
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
	class="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 lg:px-6"
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

	<!-- Mobile: simple logo text in place of breadcrumbs -->
	<span class="flex-1 text-sm font-semibold text-foreground sm:hidden">Folge der Wolke</span>

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

	<!-- User menu -->
	<UserMenu {user} />
</header>

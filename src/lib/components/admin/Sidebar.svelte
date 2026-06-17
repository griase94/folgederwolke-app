<!--
  Sidebar — Aurora desktop navigation (spec §5).

  White/glass fixed surface on the wash (backdrop-filter is allowed here:
  small fixed surface, never scrolling content — spec §2 blur discipline).
  Line-art mark + Verein name. Entries from nav-registry (single source of
  truth for desktop IA). Active state: gradient-soft pill + primary-text
  label (spec §5 — the sanctioned soft-gradient treatment, §2 budget).
  "Mehr" collapsible group persists its expanded state in localStorage.
  Tablet (768–1023px) renders the 64px icon-only collapse (collapsed prop).
-->
<script lang="ts">
	import { page } from '$app/stores';
	import { mainNavItems, moreNavItems } from './nav-registry.js';
	import UserMenu from './UserMenu.svelte';
	import type { SessionUser } from '$lib/server/auth/index.js';

	interface Props {
		user: SessionUser;
		/** Collapsed = icon-only mode (tablet 768–1023px) */
		collapsed?: boolean;
	}

	let { user, collapsed = false }: Props = $props();

	// "Mehr" expanded state persists per device (spec §5).
	const MEHR_LS_KEY = 'fdw.nav.mehrOpen';

	function initialMehrOpen(): boolean {
		if (typeof localStorage === 'undefined') return false;
		try {
			return localStorage.getItem(MEHR_LS_KEY) === '1';
		} catch {
			return false; // Safari private mode etc.
		}
	}

	let moreOpen = $state(initialMehrOpen());

	function toggleMore(): void {
		moreOpen = !moreOpen;
		try {
			localStorage.setItem(MEHR_LS_KEY, moreOpen ? '1' : '0');
		} catch {
			// Storage unavailable — state stays session-local.
		}
	}

	function isActive(href: string): boolean {
		const current = $page.url.pathname;
		if (href === '/app') return current === '/app';
		return current === href || current.startsWith(href + '/');
	}

	// Icon SVG paths by icon name (lucide outlines, stroke-based).
	const ICONS: Record<string, string> = {
		LayoutDashboard:
			'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
		Inbox: 'M22 12h-6l-2 3H10l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
		MinusCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12h8',
		PlusCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12h8M12 8v8',
		Gift: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
		Users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
		FileText: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
		FolderOpen:
			'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
		Building2:
			'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18zM6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 0-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4',
		BookOpen:
			'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
		Settings:
			'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 2v2M12 22v-2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M22 12h-2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
		Shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
		ChevronDown: 'M6 9l6 6 6-6',
		ChevronUp: 'M18 15l-6-6-6 6',
	};
</script>

<aside
	class="surface-glass flex h-full flex-col border-r border-hairline"
	class:w-[240px]={!collapsed}
	class:w-[64px]={collapsed}
	aria-label="Hauptnavigation"
>
	<!-- Brand header: line-art mark + Verein name (spec §5 "Logo & iOS chrome") -->
	<div
		class="flex h-14 shrink-0 items-center gap-3 border-b border-hairline px-4"
		class:justify-center={collapsed}
	>
		<img
			src="/logo-lineart.svg"
			alt=""
			class="h-9 w-9 shrink-0"
			aria-hidden="true"
		/>
		{#if !collapsed}
			<span class="truncate text-sm font-semibold tracking-[-0.02em] text-ink-900"
				>{$page.data.vereinName}</span
			>
		{/if}
	</div>

	<!-- Main nav -->
	<nav class="flex-1 overflow-y-auto px-2 py-3" aria-label="Hauptmenü">
		<ul role="list" class="space-y-0.5" data-nav-group="main">
			{#each mainNavItems as item (item.href)}
				{@const active = isActive(item.href)}
				<li>
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={item.href}
						class="group flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
						class:bg-gradient-brand-soft={active}
						class:text-primary-text={active}
						class:text-ink-700={!active}
						class:hover:bg-secondary={!active}
						class:justify-center={collapsed}
						aria-current={active ? 'page' : undefined}
						title={collapsed ? item.label : undefined}
					>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
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
							class="shrink-0"
							aria-hidden="true"
						>
							<path d={ICONS[item.icon] ?? ''} />
						</svg>
						{#if !collapsed}
							<span>{item.label}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>

		<!-- "Mehr" collapsible section — expanded state persists (spec §5) -->
		<div class="mt-4">
			{#if !collapsed}
				<button
					type="button"
					onclick={toggleMore}
					class="flex w-full items-center justify-between rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-500 transition-colors hover:bg-secondary hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-expanded={moreOpen}
				>
					<span>Mehr</span>
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
						<path d={moreOpen ? ICONS['ChevronUp'] : ICONS['ChevronDown']} />
					</svg>
				</button>
			{/if}

			{#if moreOpen || collapsed}
				<ul role="list" class="mt-1 space-y-0.5" data-nav-group="more">
					{#each moreNavItems as item (item.href)}
						{@const active = isActive(item.href)}
						<li>
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={item.href}
								class="group flex items-center gap-3 rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
								class:bg-gradient-brand-soft={active}
								class:text-primary-text={active}
								class:text-ink-700={!active}
								class:hover:bg-secondary={!active}
								class:justify-center={collapsed}
								aria-current={active ? 'page' : undefined}
								title={collapsed ? item.label : undefined}
							>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
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
									class="shrink-0"
									aria-hidden="true"
								>
									<path d={ICONS[item.icon] ?? ''} />
								</svg>
								{#if !collapsed}
									<span>{item.label}</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</nav>

	<!-- User card → UserMenu dropdown (unchanged behaviour) -->
	<div
		class="shrink-0 border-t border-hairline p-3"
		class:flex={collapsed}
		class:justify-center={collapsed}
	>
		<UserMenu {user} variant="sidebar" {collapsed} />
	</div>
</aside>

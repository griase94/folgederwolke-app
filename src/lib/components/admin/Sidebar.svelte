<script lang="ts">
	import { page } from '$app/stores';
	import { mainNavItems, moreNavItems } from './nav-registry.js';
	import type { SessionUser } from '$lib/server/auth/index.js';

	interface Props {
		user: SessionUser;
		/** Collapsed = icon-only mode (tablet 768–1023px) */
		collapsed?: boolean;
	}

	let { user, collapsed = false }: Props = $props();

	let moreOpen = $state(false);

	function isActive(href: string): boolean {
		const current = $page.url.pathname;
		if (href === '/app') return current === '/app';
		return current.startsWith(href);
	}

	function initials(u: SessionUser): string {
		if (u.name) {
			const parts = u.name.trim().split(/\s+/);
			const first = parts[0] ?? '';
			const last = parts.length >= 2 ? (parts[parts.length - 1] ?? '') : '';
			if (parts.length >= 2 && first && last) {
				return (first[0]! + last[0]!).toUpperCase();
			}
			return u.name.slice(0, 2).toUpperCase();
		}
		return u.email.slice(0, 2).toUpperCase();
	}

	const abbr = $derived(initials(user));
	const displayName = $derived(user.name ?? user.email);

	// Icon SVG paths by icon name
	const ICONS: Record<string, string> = {
		CheckSquare:
			'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
		Inbox: 'M22 12h-6l-2 3H10l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
		CreditCard:
			'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM2 11h20',
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
		Shield:
			'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
		Mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6',
		ChevronDown: 'M6 9l6 6 6-6',
		ChevronUp: 'M18 15l-6-6-6 6',
	};
</script>

<aside
	class="flex h-full flex-col border-r border-border bg-sidebar"
	class:w-[240px]={!collapsed}
	class:w-[64px]={collapsed}
	aria-label="Hauptnavigation"
>
	<!-- Logo header -->
	<div
		class="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4"
		class:justify-center={collapsed}
	>
		<div
			class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
		>
			FW
		</div>
		{#if !collapsed}
			<span class="text-sm font-semibold text-foreground">Folge der Wolke</span>
		{/if}
	</div>

	<!-- Main nav -->
	<nav class="flex-1 overflow-y-auto px-2 py-3" aria-label="Hauptmenü">
		<ul role="list" class="space-y-0.5">
			{#each mainNavItems as item (item.href)}
				{@const active = isActive(item.href)}
				<li>
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={item.href}
						class="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
						class:bg-primary={active}
						class:text-primary-foreground={active}
						class:text-sidebar-foreground={!active}
						class:hover:bg-sidebar-accent={!active}
						class:hover:text-sidebar-accent-foreground={!active}
						aria-current={active ? 'page' : undefined}
						title={collapsed ? item.label : undefined}
					>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						<!-- Icon -->
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

		<!-- "Mehr" collapsible section -->
		<div class="mt-4">
			{#if !collapsed}
				<button
					type="button"
					onclick={() => (moreOpen = !moreOpen)}
					class="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
				<ul role="list" class="mt-1 space-y-0.5">
					{#each moreNavItems as item (item.href)}
						{@const active = isActive(item.href)}
						<li>
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={item.href}
								class="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
								class:bg-primary={active}
								class:text-primary-foreground={active}
								class:text-sidebar-foreground={!active}
								class:hover:bg-sidebar-accent={!active}
								class:hover:text-sidebar-accent-foreground={!active}
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

	<!-- User avatar at bottom -->
	<div
		class="shrink-0 border-t border-border p-3"
		class:flex={collapsed}
		class:justify-center={collapsed}
	>
		{#if collapsed}
			<div
				class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
				title={displayName}
				aria-label={displayName}
			>
				{abbr}
			</div>
		{:else}
			<div class="flex items-center gap-3">
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
					aria-hidden="true"
				>
					{abbr}
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-foreground">{displayName}</p>
					<p class="truncate text-xs text-muted-foreground">{user.email}</p>
				</div>
			</div>
		{/if}
	</div>
</aside>

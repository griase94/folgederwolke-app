<script lang="ts">
	import { page } from '$app/stores';
	import UserMenu from './UserMenu.svelte';
	import type { SessionUser } from '$lib/server/auth/index.js';

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

	const breadcrumbs = $derived((): Crumb[] => {
		const segments = $page.url.pathname.replace(/^\//, '').split('/');
		const crumbs: Crumb[] = [];
		let accumulated = '';
		for (const seg of segments) {
			accumulated += '/' + seg;
			const label = ROUTE_LABELS[seg] ?? seg;
			crumbs.push({ label, href: accumulated });
		}
		return crumbs;
	});

	// ── Search ───────────────────────────────────────────────────────────────
	let searchInput = $state<HTMLInputElement | null>(null);
	let searchValue = $state('');

	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			searchInput?.focus();
		}
	}
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
	<div class="relative hidden w-64 md:block xl:w-80">
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
			class="h-9 w-full rounded-lg border border-border bg-muted/40 py-2 pl-9 pr-16 text-sm placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
			aria-label="Admin-Suche"
		/>
		<kbd
			class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-medium text-muted-foreground"
			aria-hidden="true"
		>
			⌘K
		</kbd>
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

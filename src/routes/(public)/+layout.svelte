<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import OfflineBanner from '$lib/components/pwa/OfflineBanner.svelte';
	import { LogIn, Receipt } from '@lucide/svelte';
	import { clearPreferredEntry } from '$lib/client/pwa-entry.js';
	import type { LayoutData } from './$types.js';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// Shared chrome for every public page (Auslage form, success, status,
	// sign-in). In a standalone PWA there is no browser back button or URL bar
	// (especially on iOS), so without this header a public page is a hard
	// dead-end. The header always offers "the other door": on /sign-in it points
	// back to the form; everywhere else it points to login. The wordmark always
	// returns to the role-aware root (`/`).
	const onSignIn = $derived(page.url.pathname.startsWith('/sign-in'));
</script>

<OfflineBanner />

<header
	class="flex items-center justify-between gap-3 px-4 py-3"
	style="padding-top: max(env(safe-area-inset-top, 0px), 0.75rem);"
>
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		href="/"
		class="flex min-h-11 items-center gap-2 rounded-lg pr-2 text-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		aria-label="Zur Startseite"
	>
		<span class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10" aria-hidden="true">
			<svg
				class="h-4 w-4 text-primary"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6 19z" />
			</svg>
		</span>
		<span class="text-sm font-semibold tracking-tight">Folge der Wolke</span>
	</a>

	{#if onSignIn}
		{#if data.publicFormEnabled}
			<a
				href="/auslage-einreichen"
				class="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<Receipt class="size-4" aria-hidden="true" />
				Auslage einreichen
			</a>
		{/if}
	{:else}
		<a
			href="/sign-in"
			onclick={() => clearPreferredEntry()}
			class="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<LogIn class="size-4" aria-hidden="true" />
			Vereins-Login
		</a>
	{/if}
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</header>

{@render children()}

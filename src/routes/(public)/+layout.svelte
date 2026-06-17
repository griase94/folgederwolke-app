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
	//
	// Aurora (slice 3): the header renders ABOVE the sign-in gradient band on
	// mobile (spec §6 — the context action must be visible before any
	// scrolling), and the flex column wrapper lets the sign-in split hero
	// stretch to the remaining viewport height.
	const onSignIn = $derived(page.url.pathname.startsWith('/sign-in'));
</script>

<OfflineBanner />

<div class="flex min-h-dvh flex-col">
	<header
		class="flex items-center justify-between gap-3 px-4 py-3"
		style="padding-top: max(env(safe-area-inset-top, 0px), 0.75rem);"
	>
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href="/"
			class="flex min-h-11 items-center gap-2 rounded-[10px] pr-2 text-ink-900 transition-colors hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			aria-label="Zur Startseite"
		>
			<img src="/logo-lineart.svg" alt="" class="h-7 w-7" aria-hidden="true" />
			<span class="text-sm font-semibold tracking-tight">{page.data.vereinName}</span>
		</a>

		{#if onSignIn}
			{#if data.publicFormEnabled}
				<a
					href="/auslage-einreichen"
					class="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium text-ink-500 transition-colors hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<Receipt class="size-4" aria-hidden="true" />
					Auslage einreichen
				</a>
			{/if}
		{:else}
			<a
				href="/sign-in"
				onclick={() => clearPreferredEntry()}
				class="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium text-ink-500 transition-colors hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<LogIn class="size-4" aria-hidden="true" />
				Vereins-Login
			</a>
		{/if}
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</header>

	<div class="flex flex-1 flex-col">
		{@render children()}
	</div>
</div>

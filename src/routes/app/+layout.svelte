<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { markAuthedBefore } from '$lib/client/pwa-entry.js';
	import { invalidateAll } from '$app/navigation';
	import { browser } from '$app/environment';
	import type { LayoutData } from './$types.js';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// Reaching any /app page means this device has authenticated. Record it
	// permanently so the PWA never auto-opens the public form for this device
	// again (protects a logged-out admin from being re-trapped). See pwa-entry.ts.
	onMount(() => markAuthedBefore());

	// PWA resume refresh — silently re-fetch dashboard/KPI data when the user
	// returns to the installed PWA after backgrounding. Uses visibilitychange
	// (fires on iOS Safari PWA app-switch and on Android Chrome) rather than
	// focus, because background→foreground transitions don't always fire focus
	// on a WebView.
	//
	// Uses invalidateAll() rather than invalidate('/app') because the layout
	// and dashboard load functions issue direct DB queries — they do not call
	// fetch() or depends() with a '/app' dependency URL, so invalidate('/app')
	// would be a no-op. invalidateAll() re-runs every active load function,
	// which is precisely what we want here (layout + dashboard in one shot).
	//
	// Debounce: skip if the last refresh was < 10 s ago to prevent thrashing on
	// rapid tab switches or browser devtools focus events.
	onMount(() => {
		if (!browser) return;

		let lastRefreshAt = 0;
		const MIN_INTERVAL_MS = 10_000;

		function handleVisibilityChange() {
			if (document.visibilityState !== 'visible') return;
			const now = Date.now();
			if (now - lastRefreshAt < MIN_INTERVAL_MS) return;
			lastRefreshAt = now;
			// Fire-and-forget — do not await; we want the existing UI to keep
			// rendering while the background refresh resolves.
			invalidateAll().catch(() => {
				// Best-effort — silently ignore network errors on resume.
			});
		}

		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});
</script>

<svelte:head>
	<title>Admin – Folge der Wolke</title>
</svelte:head>

<AdminShell user={data.user}>
	{@render children()}
</AdminShell>

<!-- Single Toaster for all /app pages (svelte-sonner, richColors) -->
<Toaster richColors />

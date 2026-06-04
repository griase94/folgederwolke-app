<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types.js';
	import PwaUpdater from '$lib/components/pwa/PwaUpdater.svelte';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
	// Favicon links live in src/app.html (PM-001 fix): a multi-format set
	// (favicon.svg + favicon-16.png + favicon-32.png + favicon.ico). We
	// deliberately do NOT import a logo asset here — the previous code
	// imported the Svelte default favicon, which leaked into every tab.

	// A) Vercel Speed Insights — RUM beacon served from /_vercel/speed-insights/*
	// (same-origin), so existing script-src/connect-src 'self' covers it.
	// No-ops outside Vercel deployments and in dev.
	injectSpeedInsights();

	// B) First-paint + hydration beacon posted to /api/vitals.
	// Uses browser Performance API — no inline <script> needed (CSP-safe).
	onMount(() => {
		try {
			const paintEntries = performance.getEntriesByType('paint');
			const fcpEntry = paintEntries.find((e) => e.name === 'first-contentful-paint');
			const fcp = fcpEntry ? Math.round(fcpEntry.startTime) : null;

			const navEntries = performance.getEntriesByType('navigation');
			const nav = navEntries[0] as PerformanceNavigationTiming | undefined;
			const ttfb = nav ? Math.round(nav.responseStart) : null;
			const domContentLoaded = nav ? Math.round(nav.domContentLoadedEventEnd) : null;

			const hydrated = Math.round(performance.now());
			const route = window.location.pathname;

			const payload = { fcp, ttfb, domContentLoaded, hydrated, route, source: 'layout' };

			fetch('/api/vitals', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				keepalive: true
			}).catch(() => {
				// Intentionally swallowed — vitals beacon is best-effort.
			});
		} catch {
			// Never throw — vitals are non-critical instrumentation.
		}
	});
</script>

<svelte:head>
	{#if !data.publicFormEnabled}
		<meta name="robots" content="noindex,nofollow" />
	{/if}
</svelte:head>

{@render children()}

<!-- Registers the service worker app-wide + silent auto-update (no UI). -->
<PwaUpdater />

<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types.js';
	import PwaUpdater from '$lib/components/pwa/PwaUpdater.svelte';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
	import { page } from '$app/state';
	import { onNavigate } from '$app/navigation';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
	// Favicon links live in src/app.html (PM-001 fix): a multi-format set
	// (favicon.svg + favicon-16.png + favicon-32.png + favicon.ico). We
	// deliberately do NOT import a logo asset here — the previous code
	// imported the Svelte default favicon, which leaked into every tab.

	// D) View Transitions — progressive enhancement for cross-route navigation.
	// Wraps SvelteKit's navigation lifecycle in document.startViewTransition()
	// so the browser renders a smooth 150ms cross-fade between pages.
	// Guards:
	//   - typeof document check for SSR safety (onNavigate can run server-side
	//     in some SvelteKit versions, but we guard anyway for belt-and-suspenders)
	//   - document.startViewTransition existence check (unsupported browsers
	//     simply skip this; navigation proceeds normally)
	//   - prefers-reduced-motion: if the user has requested reduced motion we
	//     skip the transition entirely so the CSS @keyframes never play
	// The #fdw-launch overlay is removed via onMount (before any navigate fires),
	// so view transitions never interact with it.
	onNavigate((navigation) => {
		if (typeof document === 'undefined' || !document.startViewTransition) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	// A) Vercel Speed Insights — RUM beacon served from /_vercel/speed-insights/*
	// (same-origin), so existing script-src/connect-src 'self' covers it.
	// No-ops outside Vercel deployments and in dev.
	injectSpeedInsights();

	// C) Remove the branded launch overlay (#fdw-launch from app.html) once
	// the app has hydrated. Fade out over 0.2 s then detach the DOM node.
	// The overlay has a CSS failsafe auto-hide after 10 s even if this never
	// runs (JS error / disabled). onMount is browser-only — no SSR concern.
	onMount(() => {
		const el = document.getElementById('fdw-launch');
		if (el) {
			el.style.transition = 'opacity 0.2s ease-out';
			el.style.opacity = '0';
			setTimeout(() => el.remove(), 220);
		}
	});

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
			// Route PATTERN (e.g. /app/mitglieder/[id]), never the concrete path —
			// avoids writing member/entity UUIDs into the vitals log (DSGVO). This
			// matches what the Speed Insights SDK itself records.
			const route = page.route?.id ?? null;

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

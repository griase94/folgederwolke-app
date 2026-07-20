<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types.js';
	import PwaUpdater from '$lib/components/pwa/PwaUpdater.svelte';
	import { ModeWatcher, setMode } from 'mode-watcher';
	import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
	import { page } from '$app/state';
	import { onNavigate } from '$app/navigation';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// Make the fdw_mode cookie authoritative on the client. Two reasons:
	//  (1) mode-watcher's `defaultMode` is not enough — its userPrefersMode
	//      PersistedState writes its own 'system' default into localStorage at
	//      import, so ModeWatcher.onMount sees a non-empty key and ignores
	//      defaultMode → a cookie-dark visitor with no prior localStorage gets
	//      stripped back to 'system' (.dark removed, switcher shows System).
	//  (2) We read the COOKIE client-side, not data.mode: on the prerendered
	//      legal pages data.mode is baked 'system' at build time (no request
	//      cookie), so it would clobber a dark user's real choice there.
	// Only override when the cookie is actually present (the toggle sets it +
	// localStorage together), so we never fight mode-watcher's system default.
	// Runs after ModeWatcher's (child) onMount; a no-op when they already agree.
	onMount(() => {
		const m = document.cookie.match(/(?:^|;\s*)fdw_mode=(light|dark|system)\b/);
		if (m) setMode(m[1] as 'light' | 'dark' | 'system');
	});
	// Favicon links live in src/app.html: the marble set
	// (favicon.ico + favicon-16/32/96.png + apple-touch-icon.png). We
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

<!--
	Dark mode (F1): mode-watcher owns the client-side `.dark` class + the
	`mode.current` store (consumed by sonner) and tracks the OS colour scheme
	live for `system` mode. `disableHeadScriptInjection` skips its FOUC inline
	script (blocked by our `script-src 'self'` CSP) — the server already stamps
	`.dark` into the SSR HTML (hooks.server.ts) so the first paint is flash-free.
	`defaultMode` seeds it from the fdw_mode cookie when localStorage is empty.

	CRITICAL: mode-watcher also manages the `data-theme` attribute (its own
	"custom theme" feature). Without `defaultTheme` it writes data-theme="" on
	hydration, so `[data-theme="aurora"]` stops matching and EVERY token dies
	(dead gradients, transparent surfaces). `defaultTheme={data.theme}` (the
	resolved fdw_theme id) keeps data-theme="aurora" — verified by the
	post-hydration assert in aurora-impl-f1.spec.ts.
-->
<ModeWatcher
	disableHeadScriptInjection
	defaultMode={data.mode}
	defaultTheme={data.theme ?? 'aurora'}
/>

{@render children()}

<!-- Registers the service worker app-wide + silent auto-update (no UI). -->
<PwaUpdater />

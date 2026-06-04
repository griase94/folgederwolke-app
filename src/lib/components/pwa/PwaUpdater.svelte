<script lang="ts">
	/**
	 * Headless PWA service-worker registrar + silent auto-update.
	 *
	 * Mounted once in the ROOT layout so it covers every route — the public
	 * Auslage form included — not just /app/* (the old UpdateAvailableToast was
	 * mounted only inside AdminShell, so it could never fire for a public-form
	 * visitor). There is no UI: updates apply silently.
	 *
	 * Registers manually with an ABSOLUTE `/sw.js` + `scope: '/'`. vite-plugin-
	 * pwa's own (injected / useRegisterSW) registration uses a path-relative
	 * scope (`./`), so when the first page loaded is a sub-path (e.g. a shared
	 * link straight to `/auslage-einreichen`) it requests
	 * `/auslage-einreichen/sw.js` → 404 and silently skips registration —
	 * breaking the public form's offline background-sync for exactly the
	 * "Mitglied with bad signal" case it exists for. (`injectRegister: false` in
	 * vite.config disables the plugin's registration so there's no double-register.)
	 *
	 * Silent auto-update (works WITH workbox skipWaiting + clientsClaim): poll
	 * `registration.update()` every 60s; a new SW self-activates and claims the
	 * page → `controllerchange` fires. We do NOT reload immediately — a hard
	 * reload bypasses the admin forms' `beforeNavigate` dirty-checks (and those
	 * forms register no `beforeunload`), so a deploy landing mid-entry would
	 * silently discard an unsaved booking/invoice. Instead we mark the update
	 * pending and apply it on the NEXT navigation, a safe point where the user
	 * has already left the form. The common case (closing + reopening the PWA)
	 * already gets fresh assets from the SW on cold start, so this only affects
	 * a long-lived open session that spans a deploy.
	 *
	 * SSR-safe: gated on the `browser` flag, so it only runs client-side. Under
	 * `vite dev` there is no `/sw.js` (devOptions.enabled is false); the register
	 * call simply 404s and the `.catch` swallows it — harmless. We deliberately
	 * avoid gating registration on the PROD / dev build constants: under this
	 * build they constant-fold the guard into an always-true early return and
	 * dead-code-eliminate the whole body.
	 */
	import { browser } from '$app/environment';
	import { afterNavigate } from '$app/navigation';

	if (browser && 'serviceWorker' in navigator) {
		// Best-effort purge on every app load — a no-op once the legacy cache
		// is gone. Drops the fdw-api-runtime cache that previously held PII
		// (member/customer API responses).
		if ('caches' in window) {
			void caches.delete('fdw-api-runtime').catch(() => {});
		}

		navigator.serviceWorker
			.register('/sw.js', { scope: '/' })
			.then((registration) => {
				setInterval(() => {
					void registration.update().catch(() => {});
				}, 60_000);
			})
			.catch(() => {
				// Registration is best-effort (and a no-op 404 under dev); never
				// block the app.
			});

		let updatePending = false;
		let controllerActive = Boolean(navigator.serviceWorker.controller);
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (!controllerActive) {
				// First controller for this page (initial install claim under
				// clientsClaim) — adopt it silently, nothing to apply.
				controllerActive = true;
				return;
			}
			// A genuine update activated. Defer the reload to the next navigation.
			updatePending = true;
		});

		// Apply a pending update on the next navigation — never mid-form. (The
		// initial mount's afterNavigate runs with updatePending=false, so it
		// does not reload on load.)
		afterNavigate(() => {
			if (updatePending) window.location.reload();
		});
	}
</script>

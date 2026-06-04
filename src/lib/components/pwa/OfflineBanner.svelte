<script lang="ts">
	/**
	 * PM-020: subtle top-of-page banner driven by navigator.onLine + the
	 * 'online' / 'offline' events.
	 *
	 * Goes hand-in-hand with the background-sync queue wired in vite.config.ts
	 * (PM-006): if the user goes offline mid-submission the request is queued
	 * and replayed automatically when connectivity returns. The banner tells
	 * them so they don't think the form is broken.
	 *
	 * Mount once in the root layout (AdminShell + auslage-einreichen page) —
	 * fixed positioning keeps it above all content.
	 */

	let online = $state(true);

	$effect(() => {
		if (typeof navigator === 'undefined') return;
		online = navigator.onLine;

		function handleOnline() {
			online = true;
		}
		function handleOffline() {
			online = false;
		}

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);
		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});
</script>

{#if !online}
	<div
		role="status"
		aria-live="polite"
		class="fixed inset-x-0 top-0 z-50 bg-primary/10 px-4 py-2 text-center text-xs font-medium text-primary shadow-sm backdrop-blur"
		style="padding-top: calc(env(safe-area-inset-top, 0px) + 0.5rem);"
	>
		Offline — Deine Eingaben bleiben als Entwurf gespeichert. Bitte sende das Formular erneut ab, sobald du wieder Empfang hast.
	</div>
{/if}

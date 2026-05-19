<script lang="ts">
	/**
	 * Service worker update toast.
	 * When a new SW version is waiting, prompts the user to reload.
	 * Works with the "prompt" registerType from vite-pwa — the new SW
	 * calls skipWaiting(), so a reload picks up the updated assets.
	 */
	import { useRegisterSW } from 'virtual:pwa-register/svelte';

	const { needRefresh, updateServiceWorker } = useRegisterSW({
		onRegisteredSW(swUrl: string, r: ServiceWorkerRegistration | undefined) {
			// Poll every 60 s so long-running sessions still get updates.
			if (r) {
				setInterval(
					() => {
						r.update();
					},
					60 * 1000
				);
			}
		},
	});

	async function reload() {
		await updateServiceWorker(true);
	}

	function dismiss() {
		needRefresh.set(false);
	}
</script>

{#if $needRefresh}
	<div
		role="status"
		aria-live="polite"
		class="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-lg md:bottom-6"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="shrink-0 text-primary"
			aria-hidden="true"
		>
			<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
			<path d="M3 3v5h5" />
			<path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
			<path d="M16 16h5v5" />
		</svg>
		<p class="text-sm text-foreground">
			<span class="font-medium">Update verfügbar.</span>
		</p>
		<button
			type="button"
			onclick={reload}
			class="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
		>
			Neu laden
		</button>
		<button
			type="button"
			onclick={dismiss}
			class="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
			aria-label="Hinweis schließen"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	</div>
{/if}

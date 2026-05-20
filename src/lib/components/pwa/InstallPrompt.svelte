<script lang="ts">
	/**
	 * Android / Chrome "beforeinstallprompt" install CTA.
	 * Rendered inside the admin Topbar — shows a small "Install" button
	 * when the browser fires the install event.
	 *
	 * PM-011: dismissal is persisted in localStorage for 30 days. Mirrors
	 * the pattern used by IosInstallHint.svelte (STORAGE_KEY + ts).
	 */

	const STORAGE_KEY = 'fdw.install-dismissed-at';
	const DISMISS_TTL_MS = 30 * 24 * 3600 * 1000;

	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let dismissed = $state(false);

	function readPersistedDismissal(): boolean {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return false;
			const ts = Number.parseInt(raw, 10);
			if (!Number.isFinite(ts)) return false;
			return Date.now() - ts < DISMISS_TTL_MS;
		} catch {
			return false;
		}
	}

	$effect(() => {
		// Seed state from persisted dismissal so a reload doesn't re-prompt.
		if (readPersistedDismissal()) {
			dismissed = true;
		}

		function handleBeforeInstallPrompt(e: Event) {
			e.preventDefault();
			deferredPrompt = e as BeforeInstallPromptEvent;
		}

		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
	});

	async function install() {
		if (!deferredPrompt) return;
		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		if (outcome === 'accepted') {
			deferredPrompt = null;
		}
	}

	function dismiss() {
		dismissed = true;
		deferredPrompt = null;
		try {
			localStorage.setItem(STORAGE_KEY, String(Date.now()));
		} catch {
			// storage blocked — fall through; in-memory dismissal still applies for this session
		}
	}

	const visible = $derived(!!deferredPrompt && !dismissed);
</script>

{#if visible}
	<div class="flex items-center gap-1">
		<button
			type="button"
			onclick={install}
			class="flex h-8 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
			aria-label="App installieren"
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
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="7 10 12 15 17 10" />
				<line x1="12" y1="15" x2="12" y2="3" />
			</svg>
			Installieren
		</button>
		<button
			type="button"
			onclick={dismiss}
			class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
			aria-label="Installationshinweis schließen"
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

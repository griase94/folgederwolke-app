<script lang="ts">
	/**
	 * iOS Safari "Add to Home Screen" hint.
	 * Detects: iOS Safari + not already running standalone + not yet dismissed.
	 * Shows a modal with Share → Add to Home Screen instructions.
	 */

	import { page } from '$app/state';

	const STORAGE_KEY = 'fdw.ios-install-hint-dismissed';

	let visible = $state(false);

	$effect(() => {
		// Only show on iOS Safari in browser mode (not already installed as PWA)
		const isIos =
			/iphone|ipad|ipod/i.test(navigator.userAgent) ||
			// iPadOS 13+ reports as Mac but has touch
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

		const isSafari = /safari/i.test(navigator.userAgent) && !/chrome|crios|fxios/i.test(navigator.userAgent);

		const isStandalone =
			('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone) ||
			window.matchMedia('(display-mode: standalone)').matches;

		const alreadyDismissed = localStorage.getItem(STORAGE_KEY) === '1';

		if (isIos && isSafari && !isStandalone && !alreadyDismissed) {
			// Show after a short delay so it doesn't pop up before the app renders
			const t = setTimeout(() => {
				visible = true;
			}, 2000);
			return () => clearTimeout(t);
		}
	});

	function dismiss() {
		visible = false;
		try {
			localStorage.setItem(STORAGE_KEY, '1');
		} catch {
			// storage may be blocked
		}
	}
</script>

{#if visible}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
		role="dialog"
		aria-modal="true"
		aria-labelledby="ios-hint-title"
	>
		<!-- Sheet -->
		<div class="w-full max-w-sm rounded-2xl bg-background p-6 shadow-xl">
			<div class="mb-4 flex items-start justify-between gap-4">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-primary"
						aria-hidden="true"
					>
						<path d="M12 2v13" />
						<path d="m19 9-7-7-7 7" />
						<path d="M5 21h14" />
					</svg>
				</div>
				<button
					type="button"
					onclick={dismiss}
					class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
					aria-label="Hinweis schließen"
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
						aria-hidden="true"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<h2 id="ios-hint-title" class="mb-1 text-base font-semibold text-foreground">
				App zum Startbildschirm hinzufügen
			</h2>
			<p class="mb-4 text-sm text-muted-foreground">
				Installiere {page.data.vereinName} als App auf deinem iPhone oder iPad — kein App Store nötig.
			</p>

			<ol class="space-y-3 text-sm text-foreground">
				<li class="flex items-start gap-3">
					<span
						class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white"
						>1</span
					>
					<span>
						Tippe auf das
						<span class="font-medium">Teilen-Symbol</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="inline-block align-middle text-primary"
							aria-hidden="true"
						>
							<path d="M12 2v13" />
							<path d="m19 9-7-7-7 7" />
							<path d="M5 21h14" />
						</svg>
						unten in der Safari-Leiste.
					</span>
				</li>
				<li class="flex items-start gap-3">
					<span
						class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white"
						>2</span
					>
					<span>
						Scrolle und tippe auf
						<span class="font-medium">„Zum Home-Bildschirm"</span>.
					</span>
				</li>
				<li class="flex items-start gap-3">
					<span
						class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white"
						>3</span
					>
					<span>Tippe auf <span class="font-medium">„Hinzufügen"</span>.</span>
				</li>
			</ol>

			<button
				type="button"
				onclick={dismiss}
				class="mt-6 w-full rounded-xl bg-primary py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
			>
				Verstanden
			</button>
		</div>
	</div>
{/if}

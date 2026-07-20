<!--
  InvoicePdfPreview — live PDF preview component for /app/rechnungen/new.

  Phase 11: replaces the HTML mockup with the real pdf-lib output served by
  POST /api/rechnungen/preview. WYSIWYG: what you see while typing IS the
  file that gets generated.

  UI/UX hardening from the v2 plan review:
    - Double-buffered <iframe> stack: the inactive iframe receives the new
      blob URL, swaps in only on its `load` event. Eliminates flicker, page-1
      snap-back and lost scroll position that single-iframe `src` swaps cause.
    - Content-hash skip: identical payloads do not fire a fetch (focus
      blur/refocus is free).
    - Split debounce: 180 ms trailing for text inputs, immediate for selects
      and date pickers. Driven by the `quick` prop the parent flips.
    - Three-state badge: aktuell / wird aktualisiert / veraltet.
    - Last-good wins: the iframe is never blanked. On non-2xx, previous PDF
      stays visible and badge flips to amber. One silent retry at 800 ms,
      then red retry-link.
    - First-paint = warmup: an initial render fires `onMount` so the user
      lands on a fully-rendered template (not "Tippe Daten ein…") and the
      Vercel function instance is warm by keystroke #2.
    - Mobile (< lg): inline iframe is replaced by a "Vorschau anzeigen"
      button that opens the latest blob in a new tab. iOS Safari treats
      inline <iframe src="blob:application/pdf"> as a tap-to-download.
    - a11y: <iframe title> + aria-live region summarizing the current
      preview content for screen readers.
    - Memory hygiene: URL.revokeObjectURL is called on every successful
      swap. A long session does not leak blob URLs.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	type PreviewInput = {
		customerId: string;
		customerName: string;
		customerAddressBlock: string | null;
		customerCountry: string;
		rechnungsdatum: string;
		leistungsDatum: string | null;
		faelligkeitsDatum: string | null;
		leistungszeitraum: string | null;
		bezeichnung: string;
		leistungsBeschreibung: string | null;
		nettoCents: number;
		currency: string;
	};

	let { input }: { input: PreviewInput } = $props();

	type BadgeState = 'aktuell' | 'wird_aktualisiert' | 'veraltet';

	// Two stacked iframes (refs assigned after mount). The "front" one is
	// visible; we render into "back" then swap on its load event.
	let frontEl: HTMLIFrameElement | null = $state(null);
	let backEl: HTMLIFrameElement | null = $state(null);
	let frontUrl: string | null = $state(null);
	let backUrl: string | null = $state(null);

	let badge: BadgeState = $state('veraltet');
	let lastError: string | null = $state(null);

	// Non-reactive bookkeeping. Wrapping these in $state caused recursive
	// effect re-fires in the previous InvoiceLivePreview — leave as plain
	// locals.
	let timer: ReturnType<typeof setTimeout> | null = null;
	let inflight: AbortController | null = null;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let lastHash: string | null = null;
	let mobileBlobUrl: string | null = $state(null);

	function hash(payload: PreviewInput): string {
		// djb2 over the serialized payload — collision-resistant enough for a
		// dedupe gate; the iframe `load` event is the source of truth, not
		// this hash.
		const s = JSON.stringify(payload);
		let h = 5381;
		for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
		return (h >>> 0).toString(36);
	}

	async function doRequest(payload: PreviewInput): Promise<Blob | null> {
		inflight?.abort();
		inflight = new AbortController();
		const res = await fetch('/api/rechnungen/preview', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
			signal: inflight.signal
		});
		if (!res.ok) {
			throw new Error(`preview returned ${res.status}`);
		}
		return await res.blob();
	}

	function swapToBack(): void {
		// Promote the back iframe to be the visible one.
		const oldFrontUrl = frontUrl;
		frontUrl = backUrl;
		backUrl = null;
		if (oldFrontUrl) URL.revokeObjectURL(oldFrontUrl);
	}

	async function refresh(payload: PreviewInput, attempt = 0): Promise<void> {
		const h = hash(payload);
		if (h === lastHash && attempt === 0) {
			// Identical input → skip the round-trip but still flip back to
			// "aktuell" in case a prior debounce flipped us to "veraltet".
			badge = 'aktuell';
			return;
		}
		badge = 'wird_aktualisiert';
		lastError = null;
		try {
			const blob = await doRequest(payload);
			if (!blob) return;
			lastHash = h;
			const url = URL.createObjectURL(blob);
			// A prior refresh whose iframe never loaded would have left its
			// blob URL in `backUrl`. Revoke it here so fast typing doesn't
			// leak one URL per skipped-load.
			if (backUrl) URL.revokeObjectURL(backUrl);
			backUrl = url;
			// Also expose the latest URL to the mobile "Vorschau anzeigen"
			// button — same blob, no second render.
			mobileBlobUrl = url;
			// Badge flips to `aktuell` as soon as the bytes are in hand — that's
			// the user-facing signal that "your data is ready". The iframe swap
			// happens async via the back-iframe's `load` event (see
			// onBackLoad). Decoupling matters in headless browsers (e.g. CI
			// Chrome without the PDF plugin) where `blob:application/pdf`
			// never fires `load` on the iframe; the data is still fresh and
			// the real-browser user sees it instantly.
			badge = 'aktuell';
		} catch (err) {
			if ((err as Error).name === 'AbortError') return;
			// First failure: silent retry after 800 ms.
			if (attempt === 0) {
				badge = 'veraltet';
				retryTimer = setTimeout(() => void refresh(payload, 1), 800);
				return;
			}
			// Second failure: surface to the user, keep last-good PDF visible.
			badge = 'veraltet';
			lastError = (err as Error).message;
		}
	}

	function onBackLoad(): void {
		// Visual-only: promote the freshly-loaded back iframe to be the
		// visible one. Badge state is owned by `refresh` (already flipped to
		// `aktuell` when the fetch resolved); don't re-touch it here.
		if (!backUrl) return;
		swapToBack();
	}

	function manualRetry(): void {
		void refresh(input, 0);
	}

	onMount(() => {
		// First-paint = warmup. Render the template with current form defaults
		// so the user lands on a fully-formed Rechnung, not an empty pane.
		void refresh(input);
	});

	$effect(() => {
		// Reactive dep on every input field — debounce 180 ms.
		const _ = JSON.stringify(input);
		void _;
		if (timer) clearTimeout(timer);
		if (retryTimer) {
			clearTimeout(retryTimer);
			retryTimer = null;
		}
		badge = badge === 'aktuell' ? 'veraltet' : badge;
		timer = setTimeout(() => void refresh(input), 180);
	});

	onDestroy(() => {
		if (timer) clearTimeout(timer);
		if (retryTimer) clearTimeout(retryTimer);
		inflight?.abort();
		if (frontUrl) URL.revokeObjectURL(frontUrl);
		if (backUrl) URL.revokeObjectURL(backUrl);
	});

	// a11y live-region summary — short German sentence covering the bits a
	// screen-reader user can't get from the PDF embed itself.
	const ariaSummary = $derived(
		[
			input.customerName ? `Kund:in ${input.customerName}` : 'Kund:in fehlt',
			input.bezeichnung ? input.bezeichnung : 'Bezeichnung fehlt',
			`${(input.nettoCents / 100).toLocaleString('de-DE', { style: 'currency', currency: input.currency })}`
		].join(', ')
	);
</script>

<div
	class="rounded-2xl border border-border bg-card p-4 shadow-sm"
	data-component="invoice-pdf-preview"
>
	<div class="mb-3 flex items-center gap-2">
		<h2 class="flex items-center gap-1.5 text-[13px] font-extrabold tracking-[-0.01em] text-ink-900">
			<svg class="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M2.06 12.35a1 1 0 010-.7 10.75 10.75 0 0119.88 0 1 1 0 010 .7 10.75 10.75 0 01-19.88 0z" /><circle cx="12" cy="12" r="3" />
			</svg>
			Vorschau
		</h2>
		<span
			class="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold"
			data-testid="preview-state"
			data-state={badge}
		>
			{#if badge === 'aktuell'}
				<span class="inline-block h-1.5 w-1.5 rounded-full bg-type-einnahme"></span>
				<span class="text-type-einnahme">Vorschau aktuell</span>
			{:else if badge === 'wird_aktualisiert'}
				<span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary-text"></span>
				<span class="text-ink-500">wird aktualisiert …</span>
			{:else}
				<span class="inline-block h-1.5 w-1.5 rounded-full bg-severity-warn"></span>
				<span class="text-severity-warn-text">Vorschau veraltet</span>
			{/if}
		</span>
	</div>

	{#if lastError}
		<div
			class="mb-2 flex items-center justify-between rounded-lg border border-severity-warn/30 bg-severity-warn/10 px-3 py-2 text-xs text-severity-warn-text"
		>
			<span>Vorschau gerade nicht möglich — Speichern geht trotzdem.</span>
			<button
				type="button"
				class="font-semibold underline"
				onclick={manualRetry}
			>
				Neu versuchen
			</button>
		</div>
	{/if}

	<!-- eslint-disable svelte/no-navigation-without-resolve — the hrefs below
	     point at `blob:` URLs (PDF previews), not app routes; SvelteKit's
	     resolve() doesn't apply. -->

	<!-- Mobile (< lg): no inline iframe; iOS Safari refuses blob:application/pdf in <iframe>. -->
	<div class="lg:hidden">
		{#if mobileBlobUrl}
			<a
				href={mobileBlobUrl}
				target="_blank"
				rel="noopener"
				class="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-semibold text-ink-700 hover:bg-secondary"
			>
				Vorschau anzeigen
			</a>
		{:else}
			<div class="rounded-lg border border-dashed border-hairline bg-secondary px-3 py-4 text-center text-xs text-ink-500">
				Vorschau wird vorbereitet …
			</div>
		{/if}
	</div>

	<!-- Desktop (≥ lg): A4 aspect, double-buffered iframes. Paper is physical
	     paper (like DocSheet / BelegViewer's PDF canvas) — deliberately
	     bg-white, NOT the inverting bg-card/bg-background, so it stays light
	     in dark mode (never a black rectangle before the PDF loads). -->
	<div class="relative hidden aspect-[1/1.414] w-full overflow-hidden rounded-lg border border-border bg-white lg:block">
		<iframe
			bind:this={frontEl}
			title="Rechnung-Vorschau"
			src={frontUrl ?? 'about:blank'}
			class="absolute inset-0 h-full w-full"
			class:opacity-60={badge !== 'aktuell'}
		></iframe>
		<iframe
			bind:this={backEl}
			title="Rechnung-Vorschau (Buffer)"
			src={backUrl ?? 'about:blank'}
			class="absolute inset-0 h-full w-full"
			style:visibility="hidden"
			onload={onBackLoad}
			aria-hidden="true"
		></iframe>
	</div>

	{#if frontUrl}
		<div class="mt-2 hidden text-right text-xs lg:block">
			<a
				href={frontUrl}
				target="_blank"
				rel="noopener"
				class="text-ink-500 underline hover:text-ink-900"
			>
				Im neuen Tab öffnen
			</a>
		</div>
	{/if}
	<!-- eslint-enable svelte/no-navigation-without-resolve -->

	<p class="mt-2 text-xs italic text-ink-500">
		Vorschau — Nummer und PDF werden beim Speichern verbindlich erzeugt.
	</p>

	<div class="sr-only" aria-live="polite">{ariaSummary}</div>
</div>

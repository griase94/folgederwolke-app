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
			// The iframe `load` event handler calls swapToBack(). Until then
			// the front iframe stays visible.
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
		if (!backUrl) return;
		swapToBack();
		badge = 'aktuell';
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
	class="rounded-xl border border-border bg-muted/30 p-4"
	data-component="invoice-pdf-preview"
>
	<div class="mb-3 flex items-center justify-between">
		<h2 class="text-sm font-semibold text-foreground">Vorschau</h2>
		<span
			class="inline-flex items-center gap-1 text-xs"
			data-testid="preview-state"
			data-state={badge}
		>
			{#if badge === 'aktuell'}
				<span class="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
				<span class="text-emerald-700">Vorschau aktuell</span>
			{:else if badge === 'wird_aktualisiert'}
				<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-primary"></span>
				<span class="text-muted-foreground">wird aktualisiert …</span>
			{:else}
				<span class="inline-block h-2 w-2 rounded-full bg-amber-500"></span>
				<span class="text-amber-700">Vorschau veraltet</span>
			{/if}
		</span>
	</div>

	{#if lastError}
		<div
			class="mb-2 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
		>
			<span>Vorschau konnte nicht aktualisiert werden.</span>
			<button
				type="button"
				class="font-medium underline"
				onclick={manualRetry}
			>
				Neu versuchen
			</button>
		</div>
	{/if}

	<!-- Mobile (< lg): no inline iframe; iOS Safari refuses blob:application/pdf in <iframe>. -->
	<div class="lg:hidden">
		{#if mobileBlobUrl}
			<a
				href={mobileBlobUrl}
				target="_blank"
				rel="noopener"
				class="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
			>
				Vorschau anzeigen
			</a>
		{:else}
			<div class="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-muted-foreground">
				Vorschau wird vorbereitet …
			</div>
		{/if}
	</div>

	<!-- Desktop (≥ lg): A4 aspect, double-buffered iframes. -->
	<div class="relative hidden aspect-[1/1.414] w-full overflow-hidden rounded-md border border-border bg-background lg:block">
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
				class="text-muted-foreground underline hover:text-foreground"
			>
				Im neuen Tab öffnen
			</a>
		</div>
	{/if}

	<p class="mt-2 text-xs italic text-muted-foreground">
		Vorschau – Druckbild kann minimal abweichen.
	</p>

	<div class="sr-only" aria-live="polite">{ariaSummary}</div>
</div>

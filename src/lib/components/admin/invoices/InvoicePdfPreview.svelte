<!--
  InvoicePdfPreview — live PDF preview component for /app/rechnungen/new.

  Phase 11: replaces the HTML mockup with the real pdf-lib output served by
  POST /api/rechnungen/preview. WYSIWYG: what you see while typing IS the
  file that gets generated.

  Andy-Feedback 2026-07: the preview renders the PDF to an on-screen <canvas>
  via pdfjs-dist (same pipeline as BelegViewer / DocSheet), NOT a browser
  <iframe> PDF embed. Two reasons, both Andy's:
    - CHROMELESS: no grey browser PDF-toolbar eating vertical room.
    - WHOLE PAGE, NO SCROLL: the canvas is painted at a fixed high scale and
      displayed inside an A4-aspect box (`h-full w-full`) — the entire page is
      always visible, scaled to fit, in every browser (and in headless CI,
      where `blob:application/pdf` never renders inside an iframe at all).
  "Im neuen Tab öffnen" stays for the pixel-exact full viewer.

  UI/UX hardening carried over from the iframe version:
    - Content-hash skip: identical payloads do not fire a fetch.
    - Split debounce: 180 ms trailing after the last input change.
    - Three-state badge: aktuell / wird aktualisiert / veraltet — see
      invoice-preview-badge.ts. The badge is DERIVED (never mutated in an
      effect that reads it) so it can't get stuck on "veraltet".
    - Last-good wins: the canvas is never blanked. On a failed fetch/render the
      previous page stays painted and the badge flips to amber. One silent
      retry at 800 ms, then a red retry-link.
    - First-paint = warmup: an initial render fires onMount so the user lands
      on a fully-rendered template and the Vercel function is warm by keystroke.
    - The canvas renders at EVERY width (pdfjs paints on mobile too, like
      BelegViewer); below xl the A4 box is height-capped so the whole page fits
      without scrolling. "Im neuen Tab öffnen" is the secondary full-res link.
    - a11y: aria-live region summarizing the current preview for screen readers.
    - Memory hygiene: object URLs revoked on replace; pdfjs docs destroyed.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	// Vite worker URL — use ?url suffix (mirrors BelegViewer / file-compress; the
	// `new URL` trick does NOT resolve node_modules assets). pdfjs-dist is already
	// in the client bundle via BelegViewer, so this adds no bundle weight.
	import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
	import * as pdfjs from 'pdfjs-dist';
	import { previewBadge, type PreviewBadge } from './invoice-preview-badge.js';

	// Minimal structural typing of the pdfjs API we use (mirrors BelegViewer).
	interface PdfWorkerHost {
		GlobalWorkerOptions: { workerSrc: string };
		getDocument: (args: { data: Uint8Array }) => { promise: Promise<PdfDocument> };
	}
	interface PdfDocument {
		numPages: number;
		getPage(n: number): Promise<PdfPage>;
		destroy?: () => Promise<void>;
	}
	interface PdfRenderTask {
		promise: Promise<void>;
		cancel(extraDelay?: number): void;
	}
	interface PdfPage {
		getViewport(opts: { scale: number }): { width: number; height: number };
		render(args: {
			canvasContext: CanvasRenderingContext2D;
			viewport: { width: number; height: number };
		}): PdfRenderTask;
		cleanup?: () => void;
	}

	const pdf = pdfjs as unknown as PdfWorkerHost;
	// Wire the worker exactly once (idempotent — same shared worker as BelegViewer).
	pdf.GlobalWorkerOptions.workerSrc = workerSrc;

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

	type BadgeState = PreviewBadge;

	// Fixed render scale — A4 at scale 2.5 ≈ 1487×2104 px, comfortably crisp when
	// scaled down into the ~400 px preview column on any DPR. Fixed (not measured)
	// keeps the pipeline simple and resize-proof; the A4-aspect box does the fit.
	const RENDER_SCALE = 2.5;

	let canvasEl: HTMLCanvasElement | null = $state(null);
	let hasPainted = $state(false); // first successful canvas paint → drop skeleton
	let renderFailed = $state(false); // pdfjs couldn't paint → show open-in-tab fallback

	// Badge is DERIVED, never mutated in place. The previous version stored
	// `badge` as $state and flipped it inside the debounce $effect — but that
	// effect also *read* badge, making badge its own dependency: the moment
	// `refresh` set badge='aktuell', the effect re-fired and flipped it back to
	// 'veraltet'. Result: "Vorschau veraltet" showed permanently. Now the badge
	// is a pure function of facts the effect never reads:
	//   - `phase`         : loading | idle | error  (owned by refresh)
	//   - `renderedHash`  : the hash of the input whose bytes are in hand
	// See invoice-preview-badge.ts for the exact truth table.
	let phase: 'loading' | 'idle' | 'error' = $state('loading');
	let renderedHash: string | null = $state(null);
	let lastError: string | null = $state(null);

	// Non-reactive bookkeeping.
	let timer: ReturnType<typeof setTimeout> | null = null;
	let inflight: AbortController | null = null;
	let retryTimer: ReturnType<typeof setTimeout> | null = null;
	let renderTask: PdfRenderTask | null = null;
	// Latest blob URL — powers the mobile "Vorschau anzeigen" + desktop "Im neuen
	// Tab öffnen" links. Revoked when replaced (no per-keystroke URL leak).
	let blobUrl: string | null = $state(null);

	function hash(payload: PreviewInput): string {
		// djb2 over the serialized payload — a cheap dedupe gate.
		const s = JSON.stringify(payload);
		let h = 5381;
		for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
		return (h >>> 0).toString(36);
	}

	// Hash of the CURRENT form input (recomputed reactively) and the DERIVED
	// badge. `currentHash` is the single reactive dep the badge needs; the
	// debounce $effect below depends on it too, but never on `badge`/`phase`.
	const currentHash = $derived(hash(input));
	const badge: BadgeState = $derived(previewBadge(phase, renderedHash, currentHash));

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

	function isCancellation(e: unknown): boolean {
		return (e as { name?: string } | null)?.name === 'RenderingCancelledException';
	}

	// Paint page 1 of the PDF bytes onto the desktop canvas at a fit scale.
	// Returns true on a real paint, false when there's no canvas (mobile / hidden)
	// or the render was superseded — the caller only flips `renderFailed` on a
	// genuine error. A prior in-flight render for this canvas is cancelled first
	// (pdfjs throws on concurrent render() to the same canvas).
	async function paintToCanvas(buf: ArrayBuffer): Promise<'painted' | 'skipped' | 'failed'> {
		const canvas = canvasEl;
		if (!canvas) return 'skipped'; // mobile / not laid out
		renderTask?.cancel();
		let doc: PdfDocument | null = null;
		try {
			doc = await pdf.getDocument({ data: new Uint8Array(buf) }).promise;
			const page = await doc.getPage(1);
			const viewport = page.getViewport({ scale: RENDER_SCALE });
			const ctx = canvas.getContext('2d');
			if (!ctx) return 'failed';
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			const task = page.render({ canvasContext: ctx, viewport });
			renderTask = task;
			try {
				await task.promise;
			} finally {
				if (renderTask === task) renderTask = null;
			}
			page.cleanup?.();
			return 'painted';
		} catch (e) {
			if (isCancellation(e)) return 'skipped'; // superseded by a newer render
			console.warn('[InvoicePdfPreview] canvas render failed:', e);
			return 'failed';
		} finally {
			void doc?.destroy?.();
		}
	}

	async function refresh(payload: PreviewInput, attempt = 0): Promise<void> {
		const h = hash(payload);
		if (h === renderedHash && attempt === 0) {
			// Identical to what's already in hand → skip the round-trip. The derived
			// badge already reads 'aktuell' (renderedHash === currentHash).
			phase = 'idle';
			return;
		}
		phase = 'loading';
		lastError = null;
		try {
			const blob = await doRequest(payload);
			if (!blob) return;
			const buf = await blob.arrayBuffer();
			// Expose the blob to the mobile + open-in-tab links (revoke the prior).
			const url = URL.createObjectURL(blob);
			if (blobUrl) URL.revokeObjectURL(blobUrl);
			blobUrl = url;
			// Bytes are in hand — the data IS ready. Record the hash + settle the
			// phase now (not after the paint): the badge signals "your data is
			// ready", and mobile has no canvas to paint. Matches the old design's
			// "flip when bytes arrive, not on iframe load".
			renderedHash = h;
			phase = 'idle';
			// Paint the desktop canvas (display only — never gates the badge).
			const result = await paintToCanvas(buf);
			if (result === 'painted') {
				hasPainted = true;
				renderFailed = false;
			} else if (result === 'failed') {
				renderFailed = true;
			}
		} catch (err) {
			if ((err as Error).name === 'AbortError') return;
			// First failure: silent retry after 800 ms. phase='error' surfaces the
			// amber "veraltet" while the last-good page stays painted.
			if (attempt === 0) {
				phase = 'error';
				retryTimer = setTimeout(() => void refresh(payload, 1), 800);
				return;
			}
			// Second failure: surface to the user, keep the last-good page visible.
			phase = 'error';
			lastError = (err as Error).message;
		}
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
		// Depend ONLY on the input hash — never on `badge`/`phase`, so this effect
		// can't re-trigger itself (the old bug). When the input changes,
		// `currentHash` diverges from `renderedHash` and the derived badge reads
		// 'veraltet' on its own until the debounced refresh lands a fresh paint.
		void currentHash;
		if (timer) clearTimeout(timer);
		if (retryTimer) {
			clearTimeout(retryTimer);
			retryTimer = null;
		}
		timer = setTimeout(() => void refresh(input), 180);
	});

	onDestroy(() => {
		if (timer) clearTimeout(timer);
		if (retryTimer) clearTimeout(retryTimer);
		inflight?.abort();
		renderTask?.cancel();
		if (blobUrl) URL.revokeObjectURL(blobUrl);
	});

	// a11y live-region summary — short German sentence covering the bits a
	// screen-reader user can't get from the PDF canvas itself.
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
			<button type="button" class="font-semibold underline" onclick={manualRetry}>
				Neu versuchen
			</button>
		</div>
	{/if}

	<!-- eslint-disable svelte/no-navigation-without-resolve — the hrefs below
	     point at `blob:` URLs (PDF previews), not app routes; SvelteKit's
	     resolve() doesn't apply. -->

	<!-- Whole A4 page painted to a canvas at EVERY width — the canvas renders
	     everywhere (pdfjs paints on mobile too, exactly like BelegViewer in this
	     repo; the old "iOS blocks blob:pdf" caveat was an <iframe> limitation).
	     Below xl (the Vorschau tab on tablet/phone) the box is height-capped
	     (max-w derived from ~72dvh at A4 ratio) so the ENTIRE page is visible
	     without scrolling; at xl it fills the sticky preview column. Paper is
	     physical paper (bg-white, never inverting) — light in dark mode. -->
	<div
		class="relative mx-auto aspect-[1/1.414] w-full max-w-[calc(72dvh/1.414)] overflow-hidden rounded-lg border border-border bg-white xl:mx-0 xl:max-w-none"
	>
		<canvas
			bind:this={canvasEl}
			class="absolute inset-0 h-full w-full"
			class:opacity-60={badge !== 'aktuell'}
			aria-label="Rechnung-Vorschau"
		></canvas>

		{#if renderFailed}
			<!-- pdfjs couldn't paint (rare: corrupt/huge) — offer the raw viewer. -->
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white p-8 text-center">
				<svg class="h-10 w-10 text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" />
				</svg>
				<p class="text-xs text-neutral-500">Vorschau konnte nicht gerendert werden.</p>
				{#if blobUrl}
					<a href={blobUrl} target="_blank" rel="noopener" class="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">
						Im neuen Tab öffnen
					</a>
				{/if}
			</div>
		{:else if !hasPainted}
			<!-- First-run placeholder: a document-shaped skeleton until the first
			     page paints. Fixed light-gray tones (not ink-* tokens) — the paper
			     never inverts in dark mode. -->
			<div
				class="absolute inset-0 flex animate-pulse flex-col bg-white p-8"
				aria-hidden="true"
				data-testid="preview-skeleton"
			>
				<div class="flex items-start justify-between">
					<div class="h-3 w-24 rounded bg-neutral-200"></div>
					<div class="h-9 w-9 rounded bg-neutral-100"></div>
				</div>
				<div class="mt-10 h-2.5 w-36 rounded bg-neutral-100"></div>
				<div class="mt-2 h-2.5 w-28 rounded bg-neutral-100"></div>
				<div class="mt-10 flex flex-col gap-2">
					<div class="h-2 w-full rounded bg-neutral-100"></div>
					<div class="h-2 w-full rounded bg-neutral-100"></div>
					<div class="h-2 w-5/6 rounded bg-neutral-100"></div>
				</div>
				<div class="mt-auto flex justify-end">
					<div class="h-3 w-24 rounded bg-neutral-200"></div>
				</div>
			</div>
		{/if}
	</div>

	{#if blobUrl}
		<!-- Secondary link at every width: the full-res PDF in a new tab (the
		     inline canvas is the primary; this is the "print/zoom" escape hatch). -->
		<div class="mt-2 text-right text-xs">
			<a href={blobUrl} target="_blank" rel="noopener" class="text-ink-500 underline hover:text-ink-900">
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

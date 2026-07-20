<!--
  BelegViewer — Task 5, Phase 3. Spec §11.

  Unified Beleg viewer for blob-backed `files` rows:
    - image/*          → <img> from /api/files/[id]/blob
    - application/pdf  → rendered page-by-page to an ON-SCREEN <canvas> via
                         pdfjs-dist (lazy, one page at a time; memory safety).
                         "Original öffnen" is the graceful fallback for the rare
                         unrenderable PDF (encrypted/corrupt/huge).

  Modes:
    - mode="inline" (default): desktop left-column permanent viewer.
    - mode="fold": mobile peek card (clipped + gradient). For images the peek
      shows the thumbnail; for PDFs the peek renders page-1 to a SMALL canvas
      (P3-05 — the PDF icon is ONLY the render-failure fallback, not the
      default peek). Tapping the peek opens the full-screen viewer.

  Client-import constraint (review S1): fileViewUrl/fileThumbnailUrl live in
  $lib/server/files/storage.ts (imports $lib/server/env) and CANNOT be imported
  into a client component. We INLINE the URLs here. Auth + access control is
  enforced server-side by /api/files/[id]/blob (authorizeFileAccess).

  Worker wiring mirrors src/lib/client/file-compress.ts:27 — the Vite `?url`
  worker asset + GlobalWorkerOptions.workerSrc. CSP already allows
  `img-src blob: data:` and the same-origin `?url` worker (no CSP change).
-->
<script lang="ts">
	// Vite worker URL — use ?url suffix (mirrors file-compress.ts; the `new URL`
	// trick does NOT resolve node_modules assets).
	import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
	import * as pdfjs from 'pdfjs-dist';
	import { focusTrap } from '$lib/actions/focus-trap.js';
	import XIcon from '@lucide/svelte/icons/x';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import ExpandIcon from '@lucide/svelte/icons/expand';

	// Minimal structural typing of the pdfjs API we use (mirrors file-compress.ts).
	interface PdfWorkerHost {
		GlobalWorkerOptions: { workerSrc: string };
		getDocument: (args: { data: Uint8Array }) => { promise: Promise<PdfDocument> };
	}
	interface PdfDocument {
		numPages: number;
		getPage(n: number): Promise<PdfPage>;
		destroy?: () => Promise<void>;
	}
	// A pdfjs RenderTask: `.promise` resolves when the page is painted and is
	// REJECTED with a RenderingCancelledException if `.cancel()` is called while
	// the render is in flight (verified against pdfjs-dist@4.10.38 source).
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
	// Wire the worker exactly once (idempotent assignment — same pattern as
	// file-compress.ts:27 so we never break the shared worker config).
	pdf.GlobalWorkerOptions.workerSrc = workerSrc;

	interface Props {
		fileId: string;
		mimeType: string;
		originalFilename: string;
		mode?: 'fold' | 'inline';
	}

	let { fileId, mimeType, originalFilename, mode = 'inline' }: Props = $props();

	// Inline blob + thumbnail URLs — NO server-only import (review S1).
	const blobUrl = $derived(`/api/files/${fileId}/blob`);
	const thumbnailUrl = $derived(`/api/files/${fileId}/thumbnail`);

	const isPdf = $derived(mimeType === 'application/pdf');
	const isImage = $derived(mimeType.startsWith('image/'));

	// Full-screen viewer open state (fold mode). In inline mode the viewer is
	// always "open" (permanent left column).
	let foldOpen = $state(false);
	const viewerOpen = $derived(mode === 'inline' || foldOpen);

	// pdfjs document + paging + render state.
	let pdfDoc = $state<PdfDocument | null>(null);
	let numPages = $state(1);
	let currentPage = $state(1);
	let zoom = $state(1);
	let pdfFailed = $state(false);
	// T4: loading spinner — true from the start of loadPdf() until the first page
	// renders (or load fails). Shown in the viewer body above the canvas.
	let pdfLoading = $state(false);

	// Canvas refs: the main (viewer) canvas and the small peek canvas (fold).
	let mainCanvas = $state<HTMLCanvasElement | null>(null);
	let peekCanvas = $state<HTMLCanvasElement | null>(null);
	let peekFailed = $state(false);

	const BASE_SCALE = 1.5; // device-pixel friendly base render scale
	const PEEK_SCALE = 0.7; // small page-1 peek

	async function loadPdf(): Promise<void> {
		if (!isPdf) return;
		pdfLoading = true;
		try {
			const res = await fetch(blobUrl);
			if (!res.ok) throw new Error(`blob fetch failed: ${res.status}`);
			const buf = await res.arrayBuffer();
			const doc = await pdf.getDocument({ data: new Uint8Array(buf) }).promise;
			pdfDoc = doc;
			numPages = doc.numPages;
			pdfFailed = false;
		} catch (e) {
			console.warn('[BelegViewer] PDF load failed, falling back to Original öffnen:', e);
			pdfFailed = true;
			peekFailed = true;
		} finally {
			pdfLoading = false;
		}
	}

	// In-flight RenderTask handles. The main viewer canvas and the fold peek
	// canvas render concurrently to DIFFERENT canvases, so each gets its own
	// handle — they must not cancel each other. Calling pdfjs `render()` on a
	// canvas that already has an in-flight render throws "Cannot use the same
	// canvas during multiple render() operations", so we cancel the prior task
	// for that canvas before starting a new one (e.g. fast ‹/›/+/− clicks).
	let renderTask: PdfRenderTask | null = null;
	let peekRenderTask: PdfRenderTask | null = null;

	function isCancellation(e: unknown): boolean {
		return (e as { name?: string } | null)?.name === 'RenderingCancelledException';
	}

	async function renderPage(
		doc: PdfDocument,
		pageNum: number,
		canvas: HTMLCanvasElement,
		scale: number,
		which: 'main' | 'peek'
	): Promise<void> {
		// Cancel any prior in-flight render for THIS canvas before re-rendering.
		if (which === 'main') renderTask?.cancel();
		else peekRenderTask?.cancel();

		const page = await doc.getPage(pageNum);
		const viewport = page.getViewport({ scale });
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2d context unavailable');
		canvas.width = viewport.width;
		canvas.height = viewport.height;

		const task = page.render({ canvasContext: ctx, viewport });
		if (which === 'main') renderTask = task;
		else peekRenderTask = task;
		try {
			await task.promise;
		} finally {
			if (which === 'main' && renderTask === task) renderTask = null;
			if (which === 'peek' && peekRenderTask === task) peekRenderTask = null;
		}
		page.cleanup?.();
	}

	// Lazily render the active viewer page when the doc, page, zoom, canvas, or
	// open-state change. One page at a time (memory safety, spec §11). A render
	// superseded by a fast nav/zoom is cancelled — that REJECTS the prior task's
	// promise with RenderingCancelledException, which we swallow (it is user
	// navigation, NOT a render failure, so we must not flip to the fallback).
	$effect(() => {
		if (!isPdf || !viewerOpen || pdfFailed) return;
		const doc = pdfDoc;
		const canvas = mainCanvas;
		const page = currentPage;
		const scale = BASE_SCALE * zoom;
		if (!doc || !canvas) return;
		renderPage(doc, page, canvas, scale, 'main').catch((e) => {
			if (isCancellation(e)) return; // superseded by user nav, not a failure
			console.warn('[BelegViewer] page render failed:', e);
			pdfFailed = true;
		});
		// Teardown: cancel the in-flight render when this effect re-runs / unmounts.
		return () => renderTask?.cancel();
	});

	// Fold peek: render page-1 to the small peek canvas (P3-05). Icon fallback
	// only when this render genuinely fails (cancellation is not a failure).
	$effect(() => {
		if (!isPdf || mode !== 'fold') return;
		const doc = pdfDoc;
		const canvas = peekCanvas;
		if (!doc || !canvas) return;
		renderPage(doc, 1, canvas, PEEK_SCALE, 'peek').catch((e) => {
			if (isCancellation(e)) return;
			console.warn('[BelegViewer] peek render failed, showing icon:', e);
			peekFailed = true;
		});
		return () => peekRenderTask?.cancel();
	});

	// Load (or reload) the PDF whenever `fileId` changes. Keyed on `fileId` so a
	// prop change reloads instead of showing a stale doc; on teardown we cancel
	// in-flight renders + destroy the worker doc so unmount doesn't leak it.
	$effect(() => {
		if (!isPdf) return;
		// Read fileId so this effect is keyed on it (re-runs on prop change).
		void fileId;
		// Reset paging + failure state for the (re)load.
		currentPage = 1;
		pdfFailed = false;
		peekFailed = false;
		pdfLoading = false;
		pdfDoc = null;

		let cancelled = false;
		let loadedDoc: PdfDocument | null = null;
		void loadPdf().then(() => {
			if (cancelled) {
				// Unmounted / fileId changed mid-load — destroy the now-orphaned doc.
				void pdfDoc?.destroy?.();
			} else {
				loadedDoc = pdfDoc;
			}
		});

		return () => {
			cancelled = true;
			renderTask?.cancel();
			peekRenderTask?.cancel();
			void (loadedDoc ?? pdfDoc)?.destroy?.();
			pdfDoc = null;
		};
	});

	function zoomIn() {
		zoom = Math.min(zoom + 0.25, 4);
	}
	function zoomOut() {
		zoom = Math.max(zoom - 0.25, 0.5);
	}
	function prevPage() {
		if (currentPage > 1) currentPage -= 1;
	}
	function nextPage() {
		if (currentPage < numPages) currentPage += 1;
	}
	function goToPage(n: number) {
		currentPage = n;
	}
	function openFold() {
		foldOpen = true;
	}
	function closeFold() {
		foldOpen = false;
	}
</script>

<!--
  ===========================================================================
  FOLD PEEK CARD (mobile) — clipped peek + gradient + "Beleg ansehen".
  ===========================================================================
-->
{#if mode === 'fold'}
	<!-- The peek trigger stays mounted while the full-screen viewer is open (the
	     opaque overlay covers it) so focusTrap can restore focus here on close. -->
	<div data-beleg-mode="fold" class="w-full">
		<button
			type="button"
			onclick={openFold}
			class="relative block w-full overflow-hidden rounded-lg border bg-muted/30 text-left"
			aria-label="Beleg ansehen"
		>
			<!-- Clipped peek (top slice). -->
			<div class="pointer-events-none h-32 overflow-hidden">
				{#if isImage}
					<img
						src={thumbnailUrl}
						alt={originalFilename}
						class="w-full object-cover object-top"
					/>
				{:else if isPdf && !peekFailed}
					<!-- P3-05: page-1 rendered to a small canvas (default peek). -->
					<canvas bind:this={peekCanvas} class="w-full"></canvas>
				{:else}
					<!-- Render-failure fallback ONLY (or non-image/non-pdf). -->
					<div class="flex h-full items-center justify-center text-muted-foreground">
						<FileTextIcon class="size-10" aria-hidden="true" />
					</div>
				{/if}
			</div>
			<!-- Fade gradient + label. -->
			<div
				class="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-2 pt-8 text-sm font-medium"
			>
				<ExpandIcon class="size-4" aria-hidden="true" />
				Beleg ansehen
			</div>
		</button>
	</div>
{/if}

<!--
  ===========================================================================
  VIEWER — inline (permanent left column) OR full-screen overlay (fold open).
  ===========================================================================
-->
{#snippet viewerBody(titleId: string | undefined)}
		<!-- Header: filename + controls. -->
		<div class="flex items-center gap-2 border-b px-3 py-2">
			<span id={titleId} class="truncate text-sm font-medium" title={originalFilename}>
				{originalFilename}
			</span>

			<div class="ml-auto flex items-center gap-1">
				{#if isPdf && !pdfFailed}
					<!-- Zoom controls. -->
					<button
						type="button"
						onclick={zoomOut}
						class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
						aria-label="Verkleinern"
						title="Verkleinern"
					>
						<MinusIcon class="size-4" aria-hidden="true" />
					</button>
					<button
						type="button"
						onclick={zoomIn}
						class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
						aria-label="Vergrößern"
						title="Vergrößern"
					>
						<PlusIcon class="size-4" aria-hidden="true" />
					</button>
				{/if}

				<!--
					Original öffnen (spec §11 header control — opens the raw blob in a
					new tab; always available). This is the canonical "Original öffnen"
					control. The body render-failure fallback link below uses a
					distinct accessible name ("Original in neuem Tab öffnen") so that
					when the PDF fails to render and both are visible, screen-reader
					users are not presented with two identically-named links.
				-->
				<!-- eslint-disable svelte/no-navigation-without-resolve -- blobUrl is an object/file URL, not a typed app route -->
				<a
					href={blobUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
					aria-label="Original öffnen"
					title="Original öffnen"
				>
					<ExternalLinkIcon class="size-4" aria-hidden="true" />
				</a>

				<!-- Download. -->
				<a
					href={blobUrl}
					download={originalFilename}
					class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
					aria-label="Herunterladen"
					title="Herunterladen"
				>
					<DownloadIcon class="size-4" aria-hidden="true" />
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->

				{#if mode === 'fold'}
					<!-- Schließen (full-screen only). -->
					<button
						type="button"
						onclick={closeFold}
						class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted"
						aria-label="Schließen"
						title="Schließen"
					>
						<XIcon class="size-4" aria-hidden="true" />
					</button>
				{/if}
			</div>
		</div>

		<!-- Body: scrollable viewer surface. -->
		<div class="relative min-h-0 flex-1 overflow-auto bg-muted/20 p-4">
			<!-- T4: PDF loading spinner — shown while the document is being fetched /
			     parsed; cleared once the first page renders or an error fires. -->
			{#if isPdf && pdfLoading && !pdfFailed}
				<div
					data-testid="pdf-spinner"
					aria-label="PDF wird geladen…"
					aria-live="polite"
					class="absolute inset-0 flex items-center justify-center bg-muted/30"
				>
					<span
						aria-hidden="true"
						class="inline-block size-8 animate-spin rounded-full border-4 border-current border-t-transparent text-muted-foreground"
					></span>
				</div>
			{/if}
			{#if isImage}
				<img
					src={blobUrl}
					alt={originalFilename}
					class="mx-auto h-auto max-w-full rounded border"
				/>
			{:else if isPdf && !pdfFailed}
				<canvas bind:this={mainCanvas} class="mx-auto h-auto max-w-full rounded border bg-card"
				></canvas>
			{:else}
				<!-- Render-failure fallback for PDFs (and any other mimeType). -->
				<div class="flex flex-col items-center justify-center gap-3 py-10 text-center">
					<FileTextIcon class="size-12 text-muted-foreground" aria-hidden="true" />
					<p class="text-sm text-muted-foreground">
						Vorschau nicht verfügbar.
					</p>
					<!-- eslint-disable svelte/no-navigation-without-resolve -- blobUrl is an object/file URL, not a typed app route -->
					<a
						href={blobUrl}
						target="_blank"
						rel="noopener noreferrer"
						data-testid="beleg-fallback-link"
						aria-label="Original in neuem Tab öffnen"
						class="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
					>
						<ExternalLinkIcon class="size-4" aria-hidden="true" />
						Original öffnen
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</div>
			{/if}
		</div>

		<!-- Footer: page nav + dots (PDF, multi-page, renderable). -->
		{#if isPdf && !pdfFailed && numPages > 1}
			<div class="flex items-center justify-center gap-3 border-t px-3 py-2">
				<button
					type="button"
					onclick={prevPage}
					disabled={currentPage <= 1}
					class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40"
					aria-label="Vorherige Seite"
					title="Vorherige Seite"
				>
					<ChevronLeftIcon class="size-4" aria-hidden="true" />
				</button>

				<div class="flex items-center gap-1.5" role="tablist" aria-label="Seiten">
					{#each Array(numPages) as _, i (i)}
						<button
							type="button"
							onclick={() => goToPage(i + 1)}
							class="size-2 rounded-full {currentPage === i + 1
								? 'bg-foreground'
								: 'bg-muted-foreground/40'}"
							aria-label={`Seite ${i + 1}`}
							aria-current={currentPage === i + 1 ? 'page' : undefined}
						></button>
					{/each}
				</div>

				<span class="text-xs tabular-nums text-muted-foreground">
					{currentPage} / {numPages}
				</span>

				<button
					type="button"
					onclick={nextPage}
					disabled={currentPage >= numPages}
					class="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40"
					aria-label="Nächste Seite"
					title="Nächste Seite"
				>
					<ChevronRightIcon class="size-4" aria-hidden="true" />
				</button>
			</div>
		{/if}
{/snippet}

<!--
  VIEWER render. inline → permanent left column (NOT a dialog). fold + open →
  full-screen modal: role=dialog + aria-modal + aria-labelledby + focusTrap
  (traps Tab and restores focus to the peek trigger on close); Escape closes
  and stops propagation so the review route's page-level Escape handler does
  not also fire and navigate away.
-->
{#if mode === 'fold' && foldOpen}
	<div
		data-beleg-mode="fold"
		role="dialog"
		aria-modal="true"
		aria-labelledby="beleg-fold-title"
		tabindex="-1"
		use:focusTrap
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				closeFold();
			}
		}}
		class="fixed inset-0 z-50 flex flex-col bg-background"
	>
		{@render viewerBody('beleg-fold-title')}
	</div>
{:else if mode === 'inline'}
	<div data-beleg-mode="inline" class="flex h-full flex-col rounded-lg border bg-card">
		{@render viewerBody(undefined)}
	</div>
{/if}

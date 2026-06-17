<!--
  BelegHero — the Beleg surface of the review route (spec §2.2 / §2.3).

  Wraps the REAL BelegViewer (src/lib/components/files/BelegViewer.svelte):
    - desktop (compact=false): mode="inline" — a permanent tall hero with a
      1px hairline inner ring so a white PDF page doesn't melt into the card.
    - mobile (compact=true): mode="fold" — a clipped peek that opens
      BelegViewer's built-in full-screen modal (zoom + page-nav + Original/
      Herunterladen). We do NOT reimplement that modal.

  kein-Beleg: a calm slate line-art panel (desktop) / a slim muted line
  (mobile). NEVER pink (spec §2.2). This replaces AuditCard's blank-on-iOS
  FilePreview iframe.
-->
<script lang="ts">
	import BelegViewer from '$lib/components/files/BelegViewer.svelte';

	let {
		belegFileId,
		belegMimeType,
		belegOriginalFilename,
		compact = false
	}: {
		belegFileId: string | null;
		belegMimeType: string | null;
		belegOriginalFilename: string | null;
		compact?: boolean;
	} = $props();

	const hasBeleg = $derived(
		belegFileId !== null && belegMimeType !== null && belegOriginalFilename !== null
	);
</script>

{#if hasBeleg}
	{#if compact}
		<BelegViewer
			fileId={belegFileId!}
			mimeType={belegMimeType!}
			originalFilename={belegOriginalFilename!}
			mode="fold"
		/>
	{:else}
		<!-- Desktop hero: tall inline viewer with a hairline inner ring. -->
		<div
			class="h-[calc(100vh-13rem)] overflow-hidden rounded-2xl ring-1 ring-inset ring-(--hairline)"
		>
			<BelegViewer
				fileId={belegFileId!}
				mimeType={belegMimeType!}
				originalFilename={belegOriginalFilename!}
				mode="inline"
			/>
		</div>
	{/if}
{:else if compact}
	<!-- Mobile kein-Beleg: a slim muted line, no big box (spec §2.3). -->
	<div
		data-testid="kein-beleg-line"
		class="flex items-center gap-2 rounded-xl border border-hairline bg-secondary/40 px-3 py-2 text-sm text-ink-500"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="shrink-0 text-ink-300"
			aria-hidden="true"
		>
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
			<path d="M14 2v6h6" />
		</svg>
		Kein Beleg vorhanden
	</div>
{:else}
	<!-- Desktop kein-Beleg: a calm slate line-art panel (spec §2.2). -->
	<div
		data-testid="kein-beleg-panel"
		class="flex h-[calc(100vh-13rem)] flex-col items-center justify-center gap-3 rounded-2xl border border-hairline bg-secondary/40 text-center"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="56"
			height="56"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.25"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="text-ink-300"
			aria-hidden="true"
		>
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
			<path d="M14 2v6h6" />
		</svg>
		<div>
			<p class="text-sm font-medium text-ink-700">Kein Beleg vorhanden</p>
			<p class="mt-0.5 text-xs text-ink-500">ohne Datei eingereicht</p>
		</div>
	</div>
{/if}

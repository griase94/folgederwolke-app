<!--
  BelegPreview — large preview of the uploaded Beleg.

  Uses Google Drive's public file viewer (no scope required when the file is
  shared with the viewing user). The preview is embedded via <iframe> at
  /file/d/{fileId}/preview which renders the doc/image/PDF inline.

  Gracefully degrades when:
    - No Beleg was uploaded → friendly "Kein Beleg" placeholder
    - The Drive scope is blocked / the file is not shared → user-visible
      fallback with a "in Drive öffnen" link to /file/d/{fileId}/view.
-->
<script lang="ts">
	let {
		driveFileId,
		viewLink,
		originalName
	}: {
		driveFileId: string | null;
		viewLink: string | null;
		originalName: string | null;
	} = $props();

	const previewUrl = $derived(driveFileId ? `https://drive.google.com/file/d/${driveFileId}/preview` : null);
	const openUrl = $derived(viewLink ?? (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : null));

	let iframeFailed = $state(false);
</script>

<figure class="flex h-full min-h-[24rem] flex-col overflow-hidden rounded-xl border border-border bg-muted/40">
	<figcaption class="flex items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-2 text-xs">
		<span class="truncate text-muted-foreground">
			{originalName ?? 'Beleg'}
		</span>
		{#if openUrl}
			<a
				href={openUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-1 text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
					/>
				</svg>
				In Drive öffnen
			</a>
		{/if}
	</figcaption>

	{#if !driveFileId}
		<!-- No Beleg uploaded -->
		<div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center text-muted-foreground">
			<svg class="h-12 w-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>
			<p class="text-sm font-medium">Kein Beleg vorhanden</p>
			<p class="text-xs">Die Einreichung wurde ohne Datei eingereicht.</p>
		</div>
	{:else if iframeFailed}
		<!-- Iframe failed to load — fallback link -->
		<div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
			<svg class="h-10 w-10 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<p class="text-sm text-foreground">Vorschau konnte nicht geladen werden.</p>
			{#if openUrl}
				<a
					href={openUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Beleg in Google Drive öffnen →
				</a>
			{/if}
		</div>
	{:else}
		<iframe
			src={previewUrl}
			class="flex-1 w-full bg-white"
			title="Beleg-Vorschau"
			loading="lazy"
			referrerpolicy="no-referrer"
			onerror={() => (iframeFailed = true)}
		></iframe>
	{/if}
</figure>

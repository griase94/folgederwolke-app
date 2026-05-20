<!--
  FilePreview — Phase 9 generic file viewer for blob-backed `files` rows.

  Renders the file inline via /api/files/{id}/blob:
    - application/pdf → <iframe>; iOS Safari sometimes fails to render PDFs
      inside iframes, so a visible "Datei herunterladen" link is always
      shown below the iframe as a fallback (users with a blank iframe still
      have a working escape hatch).
    - image/* → <img>.
    - everything else → a plain download link.

  Caller passes the `files.id` UUID; auth + access control is enforced
  server-side by /api/files/[id]/blob (authorizeFileAccess).
-->
<script lang="ts">
	let {
		fileId,
		mimeType,
		originalFilename
	}: {
		fileId: string;
		mimeType: string;
		originalFilename: string;
	} = $props();

	const src = $derived(`/api/files/${fileId}/blob`);
</script>

{#if mimeType === 'application/pdf'}
	<iframe {src} title={originalFilename} class="h-[80vh] w-full rounded border"></iframe>
	<p class="mt-2 text-sm text-muted-foreground">
		PDF nicht sichtbar? <a href={src} download={originalFilename} class="text-primary hover:underline">Datei herunterladen</a>.
	</p>
{:else if mimeType.startsWith('image/')}
	<img {src} alt={originalFilename} class="max-h-[80vh] w-auto rounded border" />
{:else}
	<a href={src} download={originalFilename} class="text-primary hover:underline">{originalFilename} herunterladen</a>
{/if}

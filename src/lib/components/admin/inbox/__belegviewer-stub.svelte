<script lang="ts">
	let {
		fileId,
		mimeType,
		originalFilename,
		mode = 'inline'
	}: { fileId: string; mimeType: string; originalFilename: string; mode?: 'fold' | 'inline' } =
		$props();
</script>

<div
	data-testid="belegviewer-stub"
	data-mode={mode}
	data-file-id={fileId}
	data-mime={mimeType}
	data-name={originalFilename}
></div>

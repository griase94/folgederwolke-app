<!--
  BelegPreview — legacy fallback for pre-Phase-9 submissions.

  Phase 9 normalised file storage onto `/api/files/{files.id}/blob` and the
  AuditCard now routes blob-backed submissions to FilePreview. This component
  remains only for submissions whose Beleg lives on Drive (legacy
  `belegDriveFileId` column) and whose `belegFileId` is null.

  FIXME(Phase 9 follow-up: backfill drive→blob) — once every legacy Drive
  upload has been migrated into the `files` table, drop the
  `expenses.beleg_drive_file_id` column (PR2) and delete this component.

  Until then, render an "Beleg nicht verfügbar" placeholder rather than
  linking out to the external Drive workspace (the file may already have
  been moved to the archived Drive account).
-->
<script lang="ts">
	let {
		driveFileId,
		viewLink: _viewLink,
		originalName
	}: {
		driveFileId: string | null;
		viewLink: string | null;
		originalName: string | null;
	} = $props();
</script>

<figure class="flex h-full min-h-[24rem] flex-col overflow-hidden rounded-xl border border-border bg-muted/40">
	<figcaption class="flex items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-2 text-xs">
		<span class="truncate text-muted-foreground">
			{originalName ?? 'Beleg'}
		</span>
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
	{:else}
		<!-- Legacy Drive Beleg: blob backfill not yet run for this submission. -->
		<div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center text-muted-foreground">
			<svg class="h-10 w-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>
			<p class="text-sm font-medium text-foreground">Beleg nicht verfügbar</p>
			<p class="text-xs">
				Diese Einreichung wurde vor der Phase-9-Umstellung hochgeladen. Der
				Beleg liegt im Bundle bzw. Drive-Archiv.
			</p>
		</div>
	{/if}
</figure>

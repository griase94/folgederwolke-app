<script lang="ts">
	/**
	 * BelegUpload — Package B1. Aurora dropzone for Beleg on expense / Auslage forms.
	 *
	 * ARM A (default): large tap target with "Foto aufnehmen" (capture=environment)
	 * + "Datei wählen", drag-drop, thumbnail+filename+remove button.
	 *
	 * ARM B (kein-Beleg escape hatch): "Kein Beleg vorhanden" toggle hides the
	 * dropzone and reveals a mandatory Begründung textarea (min 5 chars) +
	 * an amber "Verzicht ist die dokumentierte Ausnahme" note.
	 *
	 * Form field names are FIXED (server gate reads them verbatim):
	 *   beleg         — file input(s)
	 *   keinBeleg     — checkbox
	 *   begruendung   — Begründung textarea
	 *
	 * `optional` prop: when true (Einnahme/Spende), suppresses the keinBeleg toggle
	 * and the required asterisk. `name`/`label` props allow Sachspende reuse.
	 */
	interface Props {
		/** Override the file input name (defaults to 'beleg'). */
		name?: string;
		/** Override the visible label (defaults to 'Beleg'). */
		label?: string;
		/** Accept MIME types. */
		accept?: string;
		/** When true: no kein-Beleg arm, no required asterisk (Einnahme/Spende paths). */
		optional?: boolean;
		/** Bound: is the kein-Beleg path active. */
		keinBeleg?: boolean;
		/** Bound: the Begründung text (kein-Beleg path). */
		begruendung?: string;
		/** Per-field error from a 422. */
		error?: string;
	}

	let {
		name = 'beleg',
		label = 'Beleg',
		accept = 'image/*,application/pdf',
		optional = false,
		keinBeleg = $bindable(false),
		begruendung = $bindable(''),
		error,
	}: Props = $props();

	// Thumbnail preview state
	let previewUrl = $state<string | null>(null);
	let previewName = $state<string | null>(null);

	// Drag-over highlight state
	let dragOver = $state(false);

	// Hidden file input refs (one for camera, one for file picker)
	let cameraInputEl: HTMLInputElement | undefined = $state();
	let fileInputEl: HTMLInputElement | undefined = $state();

	function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		const file = files[0];
		// Revoke any prior object URL to avoid leaks
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		if (file.type.startsWith('image/')) {
			previewUrl = URL.createObjectURL(file);
		} else {
			previewUrl = null;
		}
		previewName = file.name;
	}

	function onFileChange(e: Event) {
		handleFiles((e.currentTarget as HTMLInputElement).files);
	}

	function removeFile() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		previewName = null;
		if (cameraInputEl) cameraInputEl.value = '';
		if (fileInputEl) fileInputEl.value = '';
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function onDragLeave() {
		dragOver = false;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		handleFiles(e.dataTransfer?.files ?? null);
		// Sync the dropped file into the file input
		// (Cannot assign FileList to input directly — server reads multipart)
	}
</script>

<div class="flex flex-col gap-2" data-slot="beleg-upload">
	<!-- Label row -->
	<span class="text-sm font-medium text-ink-900">
		{label}{#if !optional}<span class="text-severity-critical" aria-hidden="true">&nbsp;*</span>{/if}
	</span>

	{#if !keinBeleg}
		<!-- ARM A — dropzone -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 transition-colors
				{dragOver
				? 'border-primary bg-primary/5'
				: 'border-hairline bg-white/60 hover:border-primary/40 hover:bg-primary/5'}"
			ondragover={onDragOver}
			ondragleave={onDragLeave}
			ondrop={onDrop}
			data-slot="beleg-dropzone"
		>
			{#if previewName}
				<!-- Thumbnail + filename + remove -->
				<div class="flex flex-col items-center gap-2">
					{#if previewUrl}
						<img
							src={previewUrl}
							alt={previewName}
							class="h-20 w-20 rounded-lg object-cover shadow-sm"
						/>
					{:else}
						<!-- PDF / non-image file icon placeholder -->
						<div class="flex h-20 w-20 items-center justify-center rounded-lg bg-muted">
							<span class="text-3xl" aria-hidden="true">📄</span>
						</div>
					{/if}
					<span class="max-w-[200px] truncate text-sm text-ink-700">{previewName}</span>
					<button
						type="button"
						onclick={removeFile}
						class="text-xs text-severity-critical-text underline-offset-2 hover:underline"
					>
						Entfernen
					</button>
				</div>
			{:else}
				<!-- Upload prompt -->
				<p class="text-sm text-ink-500">Beleg hier ablegen oder auswählen</p>
				<div class="flex flex-wrap justify-center gap-2">
					<!-- Foto aufnehmen (camera capture — mobile primary action) -->
					<button
						type="button"
						onclick={() => cameraInputEl?.click()}
						class="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-hairline bg-white px-3 text-sm font-medium text-ink-700 shadow-sm hover:bg-muted/50 active:scale-95"
					>
						<span aria-hidden="true">📷</span>
						Foto aufnehmen
					</button>
					<!-- Datei wählen -->
					<button
						type="button"
						onclick={() => fileInputEl?.click()}
						class="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-hairline bg-white px-3 text-sm font-medium text-ink-700 shadow-sm hover:bg-muted/50 active:scale-95"
					>
						Datei wählen
					</button>
				</div>
			{/if}
		</div>

		<!-- Hidden file inputs (mounted always so form picks them up; both carry name=beleg) -->
		<input
			bind:this={cameraInputEl}
			type="file"
			{name}
			{accept}
			capture="environment"
			onchange={onFileChange}
			class="hidden"
			aria-hidden="true"
			tabindex="-1"
		/>
		<input
			bind:this={fileInputEl}
			type="file"
			{name}
			{accept}
			onchange={onFileChange}
			class="hidden"
			aria-hidden="true"
			tabindex="-1"
		/>
	{/if}

	{#if !optional}
		<!-- kein-Beleg toggle -->
		<label class="flex items-center gap-2 text-sm text-ink-700">
			<input
				type="checkbox"
				name="keinBeleg"
				bind:checked={keinBeleg}
				value="true"
				class="size-4 rounded border-hairline accent-primary"
			/>
			Kein Beleg vorhanden
		</label>
	{/if}

	{#if keinBeleg && !optional}
		<!-- ARM B — Belegverzicht (friction-ful escape hatch) -->
		<div class="flex flex-col gap-1.5 rounded-xl border border-hairline bg-amber-50/60 p-3">
			<!-- Amber note -->
			<p class="text-xs font-medium text-severity-warn-text" data-slot="verzicht-note">
				Verzicht ist die dokumentierte Ausnahme
			</p>
			<label for="beleg-begruendung" class="text-sm font-medium text-ink-900">
				Begründung<span class="text-severity-critical" aria-hidden="true">&nbsp;*</span>
			</label>
			<textarea
				id="beleg-begruendung"
				name="begruendung"
				bind:value={begruendung}
				required
				minlength="5"
				rows="3"
				placeholder="Warum liegt kein Beleg vor? (mindestens 5 Zeichen)"
				class="w-full rounded-[10px] border border-hairline bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
			></textarea>
		</div>
	{/if}

	<!-- Per-field error (Beleg gate / upload failure) -->
	{#if error}
		<p class="text-xs text-severity-critical">{error}</p>
	{/if}
</div>

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
	 *   beleg         — file input
	 *   keinBeleg     — checkbox
	 *   begruendung   — Begründung textarea
	 *
	 * `optional` prop: when true (Einnahme/Spende), suppresses the keinBeleg toggle
	 * and the required asterisk. `name`/`label` props allow Sachspende reuse.
	 *
	 * Single-input design: one hidden <input type="file"> carries name=beleg.
	 * "Foto aufnehmen" temporarily sets capture="environment" before .click();
	 * "Datei wählen" removes it before .click(). Drag-drop syncs the dropped
	 * File into that same input via DataTransfer so exactly one non-empty beleg
	 * part ever reaches the server (fixes the dual-input silent-fail + drop bug).
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
		accept = 'image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf',
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

	// Single hidden file input — the only beleg field submitted with the form.
	let fileInputEl: HTMLInputElement | undefined = $state();

	function handleFiles(files: FileList | null) {
		if (!files || files.length === 0) return;
		const file = files.item(0);
		if (!file) return;
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
		if (fileInputEl) fileInputEl.value = '';
	}

	function openCamera() {
		if (!fileInputEl) return;
		fileInputEl.setAttribute('capture', 'environment');
		fileInputEl.click();
	}

	function openFilePicker() {
		if (!fileInputEl) return;
		fileInputEl.removeAttribute('capture');
		fileInputEl.click();
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
		const files = e.dataTransfer?.files ?? null;
		if (!files || files.length === 0) return;
		// Sync the dropped file into the real file input so the form submits it.
		// DataTransfer assignment to input.files is supported in all target browsers.
		if (fileInputEl) {
			const dt = new DataTransfer();
			dt.items.add(files[0]!);
			fileInputEl.files = dt.files;
		}
		handleFiles(files);
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
				: error
					? 'border-severity-critical bg-severity-critical/5'
					: 'border-hairline bg-white/60 hover:border-primary/40 hover:bg-primary/5'}"
			ondragover={onDragOver}
			ondragleave={onDragLeave}
			ondrop={onDrop}
			data-slot="beleg-dropzone"
			aria-invalid={error ? "true" : undefined}
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
						onclick={openCamera}
						class="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-hairline bg-white px-3 text-sm font-medium text-ink-700 shadow-sm hover:bg-muted/50 active:scale-95"
					>
						<span aria-hidden="true">📷</span>
						Foto aufnehmen
					</button>
					<!-- Datei wählen -->
					<button
						type="button"
						onclick={openFilePicker}
						class="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-hairline bg-white px-3 text-sm font-medium text-ink-700 shadow-sm hover:bg-muted/50 active:scale-95"
					>
						Datei wählen
					</button>
				</div>
			{/if}
		</div>

		<!-- Single hidden file input — the canonical beleg form field.
		     openCamera() sets capture="environment" before .click();
		     openFilePicker() removes it before .click().
		     Drag-drop syncs via DataTransfer (see onDrop above). -->
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
		<p class="text-xs text-severity-critical" role="alert">{error}</p>
	{/if}
</div>

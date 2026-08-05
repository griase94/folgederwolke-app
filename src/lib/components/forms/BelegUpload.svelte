<script lang="ts">
	/**
	 * BelegUpload — THE canonical Beleg field (F3 unification, A-S2b.1).
	 *
	 * One component for every Beleg surface: public Auslagen-Batch, member
	 * portal, admin entry forms (Ausgabe/Einnahme/Spende) and the inbox
	 * ManualImportSheet. The former `admin/transactions/fields/BelegUpload`
	 * is gone — it shipped photos UNCOMPRESSED.
	 *
	 * ARM A (default): dropzone with "Foto aufnehmen" (capture=environment) +
	 * "Datei wählen", drag-drop, thumbnail + filename + remove.
	 * ARM B (Verzicht escape hatch): a mandatory Begründung textarea (min 5
	 * chars) + the amber "Verzicht ist die dokumentierte Ausnahme" note.
	 *
	 * `variant` controls HOW the arms switch:
	 *   - 'checkbox' (default): a "Kein Beleg vorhanden" checkbox reveals ARM B.
	 *   - 'segment': the entry-modal-v4 `.gate` segmented control on the shared
	 *     ui/gate-line primitive.
	 * `optional` suppresses ARM B and the required asterisk entirely.
	 *
	 * COMPRESSION IS UNCONDITIONAL. Every accepted file runs through
	 * `compressIfNeeded` before it is handed on, and the compressed File is
	 * written BACK into the native <input type=file> via DataTransfer — so a
	 * plain (non-enhanced) form post carries the compressed bytes too. This is
	 * what fixed the admin path.
	 *
	 * Two consumption modes, both supported at once:
	 *   - native form field (admin): the input carries `name` and posts itself.
	 *   - controlled (public/portal batch): `bind:file` / `onfile` hand the
	 *     compressed File to a parent that builds its own multipart body.
	 *
	 * Form field names are FIXED (the server gate reads them verbatim):
	 *   beleg · keinBeleg · begruendung
	 * When several instances live on one page (batch repeater), pass a unique
	 * `idPrefix` so the Begründung label/textarea ids stay unique.
	 */
	import { GateLine } from '$lib/components/ui/gate-line/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { compressIfNeeded } from '$lib/client/file-compress.js';
	import FileCheckIcon from '@lucide/svelte/icons/file-check';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import CameraIcon from '@lucide/svelte/icons/camera';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';

	interface Props {
		/** Override the file input name (defaults to 'beleg'). */
		name?: string;
		/** Override the visible label (defaults to 'Beleg'). */
		label?: string;
		/** Accept MIME types. */
		accept?: string;
		/** When true: no Verzicht arm, no required asterisk (Einnahme/Spende paths). */
		optional?: boolean;
		/**
		 * Whether the Verzicht (kein-Beleg) arm exists at all. Defaults to true.
		 * The PUBLIC extern form sets false: Beleg stays mandatory there, a
		 * Verzicht is only offered to authenticated members (server enforces it).
		 */
		allowVerzicht?: boolean;
		/** Switch UI: 'checkbox' (default) or the entry-modal-v4 'segment' gate. */
		variant?: 'checkbox' | 'segment';
		/** Bound: is the Verzicht path active. */
		keinBeleg?: boolean;
		/** Bound: the Begründung text (Verzicht path). */
		begruendung?: string;
		/** Bound: the compressed File (controlled mode — public/portal batch). */
		file?: File | null;
		/** Fires with the compressed File (or null when removed). */
		onfile?: (file: File | null) => void;
		/** Fires on any user change — draft/dirty trigger. */
		onchange?: () => void;
		/** Fires with true once a Beleg file is present (drives the caller's gate-line). */
		onHasFile?: (present: boolean) => void;
		/** Per-field error from a 422. */
		error?: string;
		/** Optional help paragraph under the label. */
		hint?: string;
		/** Unique DOM-id prefix — required when several instances share a page. */
		idPrefix?: string;
	}

	let {
		name = 'beleg',
		label = 'Beleg',
		accept = 'image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf',
		optional = false,
		allowVerzicht = true,
		variant = 'checkbox',
		keinBeleg = $bindable(false),
		begruendung = $bindable(''),
		file = $bindable(null),
		onfile,
		onchange,
		onHasFile,
		error,
		hint,
		idPrefix = 'beleg',
	}: Props = $props();

	const begruendungId = $derived(`${idPrefix}-begruendung`);
	/** The Verzicht arm exists only where it is both allowed and meaningful. */
	const verzichtArm = $derived(!optional && allowVerzicht);

	// Segment state mirrors `keinBeleg` (verzicht = keinBeleg true). Seeded once.
	let segment = $state<'beleg' | 'verzicht'>(keinBeleg ? 'verzicht' : 'beleg');

	// Preview + compression state. The accepted `file` is the single source of
	// truth for name/size; `pending*` only covers the in-flight compression,
	// where no accepted file exists yet.
	let previewUrl = $state<string | null>(null);
	let pendingName = $state<string | null>(null);
	let pendingSize = $state<number | null>(null);
	const previewName = $derived(file?.name ?? pendingName);
	const previewSize = $derived(file?.size ?? pendingSize);
	let isCompressing = $state(false);
	let compressProgress = $state<{ stage: 'image' | 'pdf'; current: number; total: number } | null>(
		null
	);
	let uploadError = $state<string | null>(null);

	// Drag-over highlight state
	let dragOver = $state(false);

	// Single hidden file input — the only beleg field submitted with the form.
	let fileInputEl: HTMLInputElement | undefined = $state();

	const progressLabel = $derived(
		compressProgress?.stage === 'pdf'
			? `PDF wird komprimiert (Seite ${compressProgress.current} von ${compressProgress.total})…`
			: 'Bild wird komprimiert…'
	);

	function revokePreview() {
		if (previewUrl) {
			try {
				URL.revokeObjectURL(previewUrl);
			} catch {
				/* preview is cosmetic — never let it break the field */
			}
		}
		previewUrl = null;
	}

	/** Thumbnail only — a failure here must never cost us the accepted file. */
	function makePreview(f: File): string | null {
		if (!f.type.startsWith('image/')) return null;
		try {
			return URL.createObjectURL(f);
		} catch {
			return null;
		}
	}

	/**
	 * Put the (compressed) File back into the native input, so a non-enhanced
	 * form post carries the compressed bytes. DataTransfer is browser-only.
	 */
	function syncInput(f: File | null) {
		if (!fileInputEl) return;
		if (!f) {
			fileInputEl.value = '';
			return;
		}
		if (typeof DataTransfer === 'undefined') return;
		try {
			const dt = new DataTransfer();
			dt.items.add(f);
			fileInputEl.files = dt.files;
		} catch {
			// Write-back is an optimisation for non-enhanced posts. If the engine
			// refuses it, the input keeps the original pick — the controlled
			// `file`/`onfile` path below still carries the compressed bytes.
		}
	}

	async function handleFile(incoming: File) {
		uploadError = null;
		isCompressing = true;
		compressProgress = null;
		// Show the chosen name straight away — compression can take a moment.
		pendingName = incoming.name;
		pendingSize = incoming.size;
		let compressed: File;
		try {
			compressed = await compressIfNeeded(incoming, {
				onProgress: (info) => {
					compressProgress = info;
				},
			});
		} catch (e) {
			uploadError = e instanceof Error ? e.message : 'Datei konnte nicht gelesen werden.';
			pendingName = null;
			pendingSize = null;
			file = null;
			syncInput(null);
			onfile?.(null);
			onHasFile?.(false);
			return;
		} finally {
			isCompressing = false;
			compressProgress = null;
		}

		revokePreview();
		file = compressed;
		pendingName = null;
		pendingSize = null;
		previewUrl = makePreview(compressed);
		syncInput(compressed);
		onfile?.(compressed);
		onHasFile?.(true);
		onchange?.();
	}

	function onFileChange(e: Event) {
		const picked = (e.currentTarget as HTMLInputElement).files?.[0];
		if (picked) handleFile(picked);
	}

	function removeFile() {
		revokePreview();
		pendingName = null;
		pendingSize = null;
		uploadError = null;
		file = null;
		syncInput(null);
		onfile?.(null);
		onHasFile?.(false);
		onchange?.();
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
		const dropped = e.dataTransfer?.files?.[0];
		if (dropped) handleFile(dropped);
	}

	// Segment switch (entry-modal-v4 gate). `segment` is already set via bind:value;
	// here we only run the side effects. Leaving the Beleg arm clears the file so
	// the server never receives both a file AND keinBeleg=true.
	function onSegment(v: string) {
		if (v === 'verzicht') {
			removeFile();
			keinBeleg = true;
		} else {
			keinBeleg = false;
		}
		onchange?.();
	}

	function onKeinBelegToggle() {
		if (keinBeleg) removeFile();
		onchange?.();
	}

	function formatKb(bytes: number): string {
		return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}
</script>

{#snippet belegIcon()}
	<FileCheckIcon class="size-4" aria-hidden="true" />
{/snippet}
{#snippet verzichtIcon()}
	<PencilIcon class="size-4" aria-hidden="true" />
{/snippet}

{#snippet dropzone()}
	<!-- ARM A — dropzone -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 transition-colors
			{dragOver
			? 'border-primary bg-primary/5'
			: error || uploadError
				? 'border-severity-critical bg-severity-critical/5'
				: 'border-hairline bg-card/60 hover:border-primary/40 hover:bg-primary/5'}"
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		data-slot="beleg-dropzone"
		data-testid="beleg-dropzone"
		aria-invalid={error || uploadError ? 'true' : undefined}
	>
		{#if isCompressing}
			<!-- Compression is unconditional — never hand raw camera bytes on. -->
			<div
				class="flex flex-col items-center gap-2 py-4 text-sm text-ink-500"
				role="status"
				aria-live="polite"
				data-testid="beleg-compressing"
			>
				<LoaderCircleIcon class="size-5 animate-spin" aria-hidden="true" />
				{progressLabel}
			</div>
		{:else if previewName}
			<!-- Thumbnail + filename + remove -->
			<div class="flex flex-col items-center gap-2" data-testid="beleg-preview">
				{#if previewUrl}
					<img
						src={previewUrl}
						alt={previewName}
						class="h-20 w-20 rounded-lg object-cover shadow-sm"
					/>
				{:else}
					<!-- PDF / non-image file placeholder -->
					<div
						class="flex h-20 w-20 items-center justify-center rounded-lg bg-muted text-ink-500"
						aria-hidden="true"
					>
						<FileTextIcon class="size-8" />
					</div>
				{/if}
				<span class="max-w-[200px] truncate text-sm text-ink-700">{previewName}</span>
				{#if previewSize != null}
					<span class="text-xs text-ink-500">{formatKb(previewSize)}</span>
				{/if}
				<button
					type="button"
					onclick={removeFile}
					data-testid="beleg-remove"
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
					data-testid="beleg-camera"
					class="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-hairline bg-card px-3 text-sm font-medium text-ink-700 shadow-sm hover:bg-muted/50 active:scale-95"
				>
					<CameraIcon class="size-4" aria-hidden="true" />
					Foto aufnehmen
				</button>
				<!-- Datei wählen -->
				<button
					type="button"
					onclick={openFilePicker}
					data-testid="beleg-pick"
					class="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-hairline bg-card px-3 text-sm font-medium text-ink-700 shadow-sm hover:bg-muted/50 active:scale-95"
				>
					Datei wählen
				</button>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet begruendungField()}
	<!-- ARM B — Belegverzicht (friction-ful escape hatch) -->
	<div class="flex flex-col gap-1.5 rounded-xl border border-hairline bg-severity-warn-tint/60 p-3">
		<!-- Amber note -->
		<p class="text-xs font-medium text-severity-warn-text" data-slot="verzicht-note">
			Verzicht ist die dokumentierte Ausnahme
		</p>
		<label for={begruendungId} class="text-sm font-medium text-ink-900">
			Begründung<span class="text-severity-critical" aria-hidden="true">&nbsp;*</span>
		</label>
		<Textarea
			id={begruendungId}
			name="begruendung"
			bind:value={begruendung}
			oninput={() => onchange?.()}
			required
			minlength={5}
			rows={3}
			data-testid="beleg-verzicht-grund"
			placeholder="Warum liegt kein Beleg vor? (mindestens 5 Zeichen)"
		></Textarea>
		<p class="text-xs text-ink-500">
			Ohne Beleg braucht's einen nachvollziehbaren Grund. Er wandert mit ins Prüf-Protokoll.
		</p>
	</div>
{/snippet}

{#snippet fileInput()}
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
{/snippet}

<div class="flex flex-col gap-2" data-slot="beleg-upload">
	{#if variant === 'segment' && verzichtArm}
		<!-- ── entry-modal-v4 `.gate`: Beleg | Verzicht segment ────────────────── -->
		<GateLine
			{label}
			required
			pending="Pflicht: Beleg oder begründeter Verzicht"
			bind:value={segment}
			onChange={onSegment}
			options={[
				{ value: 'beleg', label: 'Beleg hochladen', icon: belegIcon },
				{ value: 'verzicht', label: 'Verzicht begründen', icon: verzichtIcon },
			]}
			data-testid="beleg-gate"
		>
			{#snippet body(value)}
				{#if value === 'verzicht'}
					{@render begruendungField()}
				{:else}
					{#if hint}
						<p class="mb-2 text-xs text-ink-500">{hint}</p>
					{/if}
					{@render dropzone()}
				{/if}
			{/snippet}
		</GateLine>

		<!-- Hidden keinBeleg mirror — the server gate reads this verbatim. -->
		<input type="hidden" name="keinBeleg" value={keinBeleg ? 'true' : 'false'} />

		<!-- The canonical beleg file input lives inside the Beleg arm only, so a
		     Verzicht submit never carries a file. Rendered here (not in the snippet)
		     so it stays wired to fileInputEl regardless of the gate body markup. -->
		{#if segment === 'beleg'}
			{@render fileInput()}
		{/if}
	{:else}
		<!-- ── checkbox variant (inbox / public / portal form) + optional dropzone ── -->
		<!-- Label row -->
		<span class="text-sm font-medium text-ink-900">
			{label}{#if !optional}<span class="text-severity-critical" aria-hidden="true">&nbsp;*</span
				>{/if}
		</span>

		{#if hint}
			<p class="text-xs text-ink-500">{hint}</p>
		{/if}

		{#if !keinBeleg}
			{@render dropzone()}
			{@render fileInput()}
		{/if}

		{#if verzichtArm}
			<!-- Verzicht toggle -->
			<label class="flex items-center gap-2 text-sm text-ink-700">
				<input
					type="checkbox"
					name="keinBeleg"
					bind:checked={keinBeleg}
					onchange={onKeinBelegToggle}
					value="true"
					data-testid="beleg-kein-beleg"
					class="size-4 rounded border-hairline accent-primary"
				/>
				Kein Beleg vorhanden
			</label>
		{/if}

		{#if keinBeleg && verzichtArm}
			{@render begruendungField()}
		{/if}
	{/if}

	<!-- Compression / read failure -->
	{#if uploadError}
		<p class="text-xs text-severity-critical" role="alert" data-testid="beleg-upload-error">
			{uploadError}
		</p>
	{/if}

	<!-- Per-field error (Beleg gate / upload failure) -->
	{#if error}
		<p class="text-xs text-severity-critical" role="alert">{error}</p>
	{/if}
</div>

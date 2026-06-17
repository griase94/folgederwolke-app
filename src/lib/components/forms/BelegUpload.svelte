<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { compressIfNeeded } from '$lib/client/file-compress.js';

	interface Props {
		file?: File | null;
		errors?: Record<string, string[]>;
		onchange?: () => void;
		onfile?: (file: File | null) => void;
		/**
		 * C2-TAX: aria-invalid passthrough so the parent form can mark the
		 * Beleg input as invalid when the schema reports a missing-beleg
		 * error. Defaults to false; the parent flips it true on validation
		 * failure.
		 */
		'aria-invalid'?: boolean;
	}

	let {
		file = $bindable(null),
		errors = {},
		onchange,
		onfile,
		...rest
	}: Props = $props();
	const ariaInvalid = $derived(Boolean(rest['aria-invalid']));

	let isDragging = $state(false);
	let isCompressing = $state(false);
	let compressProgress = $state<{ stage: 'image' | 'pdf'; current: number; total: number } | null>(
		null
	);
	let uploadError = $state<string | null>(null);
	let previewUrl = $state<string | null>(null);
	let previewType = $state<'image' | 'pdf' | null>(null);
	let blurred = $state(false);

	const progressLabel = $derived(
		compressProgress
			? compressProgress.stage === 'pdf'
				? `PDF wird komprimiert (Seite ${compressProgress.current} von ${compressProgress.total})…`
				: 'Bild wird komprimiert…'
			: 'Wird komprimiert…'
	);

	// Revoke previous object URL to prevent memory leaks
	function revokePreview() {
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
			previewUrl = null;
			previewType = null;
		}
	}

	async function handleFile(incoming: File) {
		isCompressing = true;
		compressProgress = null;
		try {
			uploadError = null;
			const compressed = await compressIfNeeded(incoming, {
				onProgress: (info) => {
					compressProgress = info;
				}
			});
			file = compressed;
			revokePreview();
			previewUrl = URL.createObjectURL(compressed);
			previewType = compressed.type === 'application/pdf' ? 'pdf' : 'image';
			onfile?.(compressed);
			onchange?.();
		} catch (e) {
			uploadError = e instanceof Error ? e.message : 'Datei-Upload fehlgeschlagen.';
			return;
		} finally {
			isCompressing = false;
			compressProgress = null;
		}
	}

	function onInputChange(e: Event & { currentTarget: HTMLInputElement }) {
		const picked = e.currentTarget.files?.[0];
		if (picked) handleFile(picked);
		blurred = true;
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const dropped = e.dataTransfer?.files?.[0];
		if (dropped) handleFile(dropped);
		blurred = true;
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function onDragLeave() {
		isDragging = false;
	}

	function removeFile() {
		file = null;
		uploadError = null;
		revokePreview();
		onfile?.(null);
		onchange?.();
	}

	const errorMsg = $derived(blurred ? errors['beleg']?.[0] : undefined);
</script>

<Card>
	<CardHeader>
		<!-- C2-TAX: surface the * required marker on the section title. -->
		<CardTitle>Beleg <span aria-hidden="true">*</span></CardTitle>
	</CardHeader>
	<CardContent class="flex flex-col gap-4">
		<p class="text-muted-foreground text-sm">
			PDF, Foto vom Bon oder Screenshot. Datum und Betrag müssen lesbar sein.
			<br />Pro Auslage ein Beleg — mehrere Käufe bitte einzeln einreichen.
		</p>

		{#if !file}
			<!-- Drop zone / file picker -->
			<div
				class="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors {isDragging
					? 'border-primary bg-primary/5'
					: 'border-muted-foreground/30 hover:border-primary/50'}"
				ondrop={onDrop}
				ondragover={onDragOver}
				ondragleave={onDragLeave}
				role="region"
				aria-label="Beleg hochladen"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-muted-foreground mb-2 h-8 w-8"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
					/>
				</svg>
				<p class="text-sm font-medium">Datei hierher ziehen oder auswählen</p>
				<p class="text-muted-foreground mt-1 text-xs">PDF, JPEG, PNG, HEIC — max. 10 MB</p>

				<!-- Desktop file picker (no capture) -->
				<label
					class="mt-3 hidden cursor-pointer rounded-md bg-secondary px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary/80 md:inline-block"
				>
					Datei auswählen
					<input
						type="file"
						name="beleg"
						accept=".pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
						class="sr-only"
						aria-invalid={ariaInvalid}
						onchange={onInputChange}
					/>
				</label>

				<!-- Mobile: two buttons — gallery + camera -->
				<div class="mt-3 flex gap-2 md:hidden">
					<label
						class="cursor-pointer rounded-md bg-secondary px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary/80"
					>
						Galerie
						<input
							type="file"
							name="beleg"
							accept=".pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
							class="sr-only"
							aria-invalid={ariaInvalid}
							onchange={onInputChange}
						/>
					</label>
					<label
						class="cursor-pointer rounded-md bg-primary-strong px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-strong/90"
					>
						Kamera
						<!-- capture="environment" triggers the camera directly on mobile -->
						<input
							type="file"
							name="beleg"
							accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
							capture="environment"
							class="sr-only"
							aria-invalid={ariaInvalid}
							onchange={onInputChange}
						/>
					</label>
				</div>
			</div>
		{:else}
			<!-- Preview area -->
			<div class="relative rounded-xl border p-3">
				{#if isCompressing}
					<div
						class="flex items-center gap-2 py-4 text-sm"
						role="status"
						aria-live="polite"
					>
						<svg
							class="text-muted-foreground h-4 w-4 animate-spin"
							fill="none"
							viewBox="0 0 24 24"
							aria-hidden="true"
						>
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
							></circle>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							></path>
						</svg>
						{progressLabel}
					</div>
				{:else if previewType === 'image' && previewUrl}
					<img
						src={previewUrl}
						alt="Beleg-Vorschau"
						class="max-h-48 w-full rounded-lg object-contain"
					/>
				{:else if previewType === 'pdf'}
					<div class="flex items-center gap-3 py-2">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-8 w-8 text-red-500"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.5"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
							/>
						</svg>
						<div>
							<p class="text-sm font-medium">{file.name}</p>
							<p class="text-muted-foreground text-xs">PDF — {(file.size / 1024).toFixed(0)} KB</p>
						</div>
					</div>
				{/if}

				<!-- File name + remove button -->
				<div class="mt-2 flex items-center justify-between gap-2">
					<p class="text-muted-foreground truncate text-xs">{file.name}</p>
					<button
						type="button"
						onclick={removeFile}
						class="text-destructive hover:text-destructive/80 shrink-0 text-xs underline"
					>
						Entfernen
					</button>
				</div>
			</div>
		{/if}

		{#if uploadError}
			<p class="text-destructive text-xs mt-2" id="err-beleg-upload" role="alert">{uploadError}</p>
		{/if}

		{#if errorMsg}
			<p class="text-destructive text-xs" role="alert">{errorMsg}</p>
		{/if}
	</CardContent>
</Card>

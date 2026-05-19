<!--
  FileUploadZone — drag-and-drop zone for legacy-sheet CSV exports.

  Accepts one or more CSV files. The filename should hint at the tab name
  (Mitglieder, Einnahmen, Ausgaben, Spenden, "Projekte und Events").
  Validates the file extension client-side; server re-validates structure.
-->
<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button/index.js';

	interface Props {
		/** Bound list of staged files (parent controls the source of truth). */
		files: File[];
		onFilesChange: (files: File[]) => void;
		disabled?: boolean;
	}

	let { files, onFilesChange, disabled = false }: Props = $props();

	let dragging = $state(false);
	let inputEl: HTMLInputElement | undefined = $state();

	function handleFiles(list: FileList | null): void {
		if (!list) return;
		const accepted: File[] = [];
		for (const f of Array.from(list)) {
			if (!/\.csv$/i.test(f.name)) continue;
			accepted.push(f);
		}
		if (accepted.length === 0) return;
		// Replace duplicates (same filename) with the newer version.
		const byName = new SvelteMap(files.map((f) => [f.name, f]));
		for (const f of accepted) byName.set(f.name, f);
		onFilesChange([...byName.values()]);
	}

	function onDrop(e: DragEvent): void {
		e.preventDefault();
		dragging = false;
		if (disabled) return;
		handleFiles(e.dataTransfer?.files ?? null);
	}

	function onDragOver(e: DragEvent): void {
		e.preventDefault();
		if (!disabled) dragging = true;
	}

	function onDragLeave(): void {
		dragging = false;
	}

	function removeFile(name: string): void {
		onFilesChange(files.filter((f) => f.name !== name));
	}
</script>

<div class="space-y-3">
	<label
		ondrop={onDrop}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition {dragging
			? 'border-pink-500 bg-pink-50'
			: 'border-muted-foreground/30 hover:border-pink-300'} {disabled ? 'opacity-50 pointer-events-none' : ''}"
	>
		<input
			bind:this={inputEl}
			type="file"
			accept=".csv,text/csv"
			multiple
			class="sr-only"
			{disabled}
			onchange={(e) => handleFiles((e.currentTarget as HTMLInputElement).files)}
		/>
		<svg
			class="h-8 w-8 text-muted-foreground"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="1.5"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
			/>
		</svg>
		<div class="text-sm font-medium text-foreground">
			CSV-Dateien hier ablegen oder
			<button
				type="button"
				class="text-pink-600 underline-offset-2 hover:underline"
				onclick={(e) => {
					e.preventDefault();
					inputEl?.click();
				}}
			>
				durchsuchen
			</button>
		</div>
		<p class="text-xs text-muted-foreground">
			Eine Datei pro Tab (Mitglieder, Einnahmen, Ausgaben, Spenden, Projekte und Events).
			<br />
			Dateiname sollte den Tab enthalten.
		</p>
	</label>

	{#if files.length > 0}
		<ul class="space-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
			{#each files as f (f.name)}
				<li class="flex items-center justify-between gap-3">
					<div class="flex items-center gap-2 truncate">
						<svg
							class="h-4 w-4 shrink-0 text-pink-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.5"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
							/>
						</svg>
						<span class="truncate">{f.name}</span>
						<span class="text-xs text-muted-foreground">
							({Math.round(f.size / 1024)} KB)
						</span>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						{disabled}
						onclick={() => removeFile(f.name)}
					>
						Entfernen
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

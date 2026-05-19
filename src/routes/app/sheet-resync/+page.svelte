<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import FileUploadZone from '$lib/components/admin/import/FileUploadZone.svelte';
	import DryRunDiff from '$lib/components/admin/import/DryRunDiff.svelte';
	import ImportProgress from '$lib/components/admin/import/ImportProgress.svelte';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let files = $state<File[]>([]);
	const defaultKey = `sheet_import_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}`;
	let idempotencyKey = $state(defaultKey);
	let forceReplace = $state(false);
	let dryRunPending = $state(false);
	let applyPending = $state(false);

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString('de-DE', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	/**
	 * Inject staged File objects into the form before submission.
	 * Each file gets a unique `csv_N` field name so the server action can
	 * iterate `data.entries()` and collect them all.
	 */
	function injectFiles(formEl: HTMLFormElement): void {
		for (const el of formEl.querySelectorAll('input[data-file-inject]')) {
			el.remove();
		}
		for (let i = 0; i < files.length; i++) {
			const dt = new DataTransfer();
			dt.items.add(files[i]!);
			const inp = document.createElement('input');
			inp.type = 'file';
			inp.name = `csv_${i}`;
			inp.dataset.fileInject = '1';
			inp.files = dt.files;
			inp.style.display = 'none';
			formEl.appendChild(inp);
		}
	}

	const planResult = $derived(form && 'plan' in form && form.plan ? form.plan : null);
	const applyResult = $derived(
		form && 'importRunId' in form && form.importRunId ? form : null
	);
	const errorMessage = $derived(form && 'error' in form ? form.error : null);

	const canDryRun = $derived(files.length > 0 && !dryRunPending && !applyPending);
	const canApply = $derived(
		planResult !== null &&
			planResult.safeToApply &&
			files.length > 0 &&
			!applyPending &&
			!dryRunPending
	);
</script>

<svelte:head>
	<title>Sheet-Import – Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8 sm:px-6">
	<!-- Header -->
	<div class="mb-6">
		<h1 class="text-2xl font-bold tracking-tight text-foreground">Legacy-Sheet Import</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			CSV-Export des Finanzen-Sheets hochladen, Vorschau prüfen und in die Datenbank importieren.
		</p>
	</div>

	<!-- SA availability hint -->
	{#if !data.saAvailable}
		<div class="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
			<strong>Hinweis:</strong> Service-Account-Datei nicht gefunden — nur CSV-Upload verfügbar.
			({data.saReason})
		</div>
	{:else}
		<div class="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
			Service-Account verfügbar. CSV-Upload trotzdem für manuelle Audits nutzbar.
		</div>
	{/if}

	<!-- Upload form -->
	<div class="mb-6 rounded-xl border bg-card p-6 shadow-sm">
		<h2 class="mb-4 text-base font-semibold text-foreground">CSV-Dateien hochladen</h2>

		<FileUploadZone
			{files}
			onFilesChange={(f) => (files = f)}
			disabled={dryRunPending || applyPending}
		/>

		<div class="mt-4 grid gap-4 sm:grid-cols-2">
			<div>
				<label for="idempotency-key" class="mb-1 block text-sm font-medium text-foreground">
					Idempotenz-Schlüssel
				</label>
				<input
					id="idempotency-key"
					type="text"
					bind:value={idempotencyKey}
					disabled={dryRunPending || applyPending}
					class="border-input focus-visible:ring-ring/50 h-9 w-full rounded-lg border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2"
					placeholder="z.B. sheet_import_2026_05_18"
				/>
				<p class="mt-1 text-xs text-muted-foreground">
					Eindeutiger Schlüssel pro Import-Run. Wiederholter Import mit gleichem Schlüssel ist ein
					No-Op.
				</p>
			</div>
			<div class="flex items-center gap-2 pt-6">
				<input
					id="force-replace"
					type="checkbox"
					bind:checked={forceReplace}
					disabled={dryRunPending || applyPending}
					class="h-4 w-4 rounded border-border accent-pink-600"
				/>
				<label for="force-replace" class="text-sm text-foreground">
					Erzwingen (überschreibe vorherigen Import mit gleichem Schlüssel)
				</label>
			</div>
		</div>

		<!-- Action buttons -->
		<div class="mt-5 flex flex-wrap gap-3">
			<!-- Dry-run form -->
			<form
				id="dry-run-form"
				method="POST"
				action="?/dry-run"
				enctype="multipart/form-data"
				onsubmit={(e) => injectFiles(e.currentTarget as HTMLFormElement)}
				use:enhance={() => {
					dryRunPending = true;
					return async ({ update }) => {
						await update();
						dryRunPending = false;
					};
				}}
			>
				<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
				<input type="hidden" name="forceReplace" value={String(forceReplace)} />
				<Button type="submit" disabled={!canDryRun}>
					{dryRunPending ? 'Analysiere...' : 'Vorschau prüfen'}
				</Button>
			</form>

			<!-- Apply form (only shown after a successful dry-run) -->
			{#if planResult}
				<form
					id="apply-form"
					method="POST"
					action="?/apply"
					enctype="multipart/form-data"
					onsubmit={(e) => injectFiles(e.currentTarget as HTMLFormElement)}
					use:enhance={() => {
						applyPending = true;
						return async ({ update }) => {
							await update();
							applyPending = false;
						};
					}}
				>
					<input type="hidden" name="idempotencyKey" value={idempotencyKey} />
					<input type="hidden" name="forceReplace" value={String(forceReplace)} />
					<Button
						type="submit"
						disabled={!canApply}
						class="bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-50"
					>
						{applyPending ? 'Importiere...' : 'Import anwenden'}
					</Button>
				</form>
			{/if}
		</div>
	</div>

	<!-- Progress indicator -->
	{#if dryRunPending}
		<div class="mb-4">
			<ImportProgress message="Analysiere CSV-Dateien..." />
		</div>
	{/if}
	{#if applyPending}
		<div class="mb-4">
			<ImportProgress message="Importiere Daten in die Datenbank..." />
		</div>
	{/if}

	<!-- Error display -->
	{#if errorMessage}
		<div
			class="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
		>
			<strong>Fehler:</strong>
			{errorMessage}
		</div>
	{/if}

	<!-- Apply result -->
	{#if applyResult}
		<div class="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
			<strong>Import erfolgreich!</strong> Run-ID:
			<code class="font-mono">{applyResult.importRunId}</code>
			<br />
			Zeilen importiert: Ausgaben {applyResult.rowsInserted.expenses}, Einnahmen
			{applyResult.rowsInserted.income}, Spenden {applyResult.rowsInserted.donations}.
		</div>
	{/if}

	<!-- Dry-run diff preview -->
	{#if planResult}
		<div class="mb-6">
			<DryRunDiff plan={planResult} />
		</div>
	{/if}

	<!-- Recent import runs -->
	{#if data.recentRuns.length > 0}
		<div class="rounded-xl border bg-card shadow-sm">
			<div class="border-b px-5 py-4">
				<h2 class="text-base font-semibold text-foreground">Letzte Import-Runs</h2>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/40 text-left text-xs text-muted-foreground">
							<th class="px-4 py-2">Schlüssel</th>
							<th class="px-4 py-2">Status</th>
							<th class="px-4 py-2">Gestartet</th>
							<th class="px-4 py-2">Abgeschlossen</th>
							<th class="px-4 py-2">Zeilen</th>
						</tr>
					</thead>
					<tbody>
						{#each data.recentRuns as run (run.id)}
							<tr class="border-b last:border-0 hover:bg-muted/20">
								<td class="px-4 py-2 font-mono text-xs">{run.idempotencyKey}</td>
								<td class="px-4 py-2">
									<span
										class="rounded-full px-2 py-0.5 text-xs font-medium {run.status === 'ok'
											? 'bg-green-100 text-green-800'
											: run.status === 'running'
												? 'bg-amber-100 text-amber-800'
												: 'bg-red-100 text-red-800'}"
									>
										{run.status}
									</span>
								</td>
								<td class="px-4 py-2 tabular-nums text-muted-foreground">
									{formatDate(run.startedAt)}
								</td>
								<td class="px-4 py-2 tabular-nums text-muted-foreground">
									{run.completedAt ? formatDate(run.completedAt) : '—'}
								</td>
								<td class="px-4 py-2 text-xs text-muted-foreground">
									{run.rowCounts ? JSON.stringify(run.rowCounts) : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

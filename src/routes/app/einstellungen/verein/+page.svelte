<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let saving = $state(false);

	type FieldKey =
		| 'name'
		| 'adresse'
		| 'iban'
		| 'bic'
		| 'steuernummer'
		| 'vr';

	const FIELDS: Array<{ key: FieldKey; label: string; placeholder?: string }> = [
		{ key: 'name', label: 'Vereinsname' },
		{ key: 'adresse', label: 'Adresse' },
		{ key: 'iban', label: 'IBAN', placeholder: 'DE…' },
		{ key: 'bic', label: 'BIC' },
		{ key: 'steuernummer', label: 'Steuernummer' },
		{ key: 'vr', label: 'Vereinsregister-Nr.' }
	];
</script>

<svelte:head><title>Stammdaten – Folge der Wolke</title></svelte:head>

<main class="container mx-auto max-w-2xl px-4 py-8 sm:px-6">
	<h1 class="mb-1 text-2xl font-bold tracking-tight text-foreground">Stammdaten</h1>
	<p class="mb-6 text-sm text-muted-foreground">
		Vereins-Stammdaten. Werte ohne Speicherung kommen aus Umgebungsvariablen.
	</p>

	{#if form?.ok}
		<div
			role="status"
			class="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
			data-testid="stammdaten-saved"
		>
			Gespeichert.
		</div>
	{/if}
	{#if form?.error}
		<div
			role="alert"
			class="mb-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive"
			data-testid="stammdaten-error"
		>
			{form.error}
		</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update();
				saving = false;
			};
		}}
		class="space-y-4"
	>
		{#each FIELDS as field (field.key)}
			<div class="space-y-1.5">
				<Label for={field.key}>{field.label}</Label>
				<Input
					id={field.key}
					name={field.key}
					value={data.stammdaten[field.key]}
					placeholder={field.placeholder ?? ''}
					data-testid={`stammdaten-${field.key}`}
				/>
				{#if data.stammdaten.source[field.key] === 'env-fallback'}
					<p
						class="text-xs text-muted-foreground"
						data-testid={`stammdaten-${field.key}-source`}
					>
						Aktuell aus Umgebungsvariable. Wird mit Speichern in DB überschrieben.
					</p>
				{/if}
			</div>
		{/each}

		<fieldset class="space-y-2">
			<legend class="text-sm font-medium text-foreground">
				Vorstands-Mitglieder (Bescheinigungs-Unterzeichner)
			</legend>
			{#if data.members.length === 0}
				<p class="text-xs text-muted-foreground" data-testid="stammdaten-vorstand-empty">
					Keine Mitglieder mit Vorstands-Rolle vorhanden.
				</p>
			{:else}
				{#each data.members as m (m.id)}
					<label class="flex items-center gap-2 text-sm text-foreground">
						<input
							type="checkbox"
							name="vorstandIds"
							value={m.id}
							checked={data.stammdaten.vorstandIds.includes(m.id)}
							data-testid="stammdaten-vorstand"
							data-member-id={m.id}
						/>
						<span>
							{m.name}
							<span class="text-xs text-muted-foreground">({m.role})</span>
						</span>
					</label>
				{/each}
			{/if}
		</fieldset>

		<Button type="submit" disabled={saving} data-testid="stammdaten-submit">
			{saving ? 'Speichere…' : 'Speichern'}
		</Button>
	</form>
</main>

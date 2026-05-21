<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let {
		open = $bindable(false),
		customers = [],
		onSuccess
	}: {
		open: boolean;
		/** C1-PRJ-A: customer list for the Default-Kunde combobox. */
		customers?: Array<{ id: string; name: string }>;
		onSuccess?: () => void;
	} = $props();

	let loading = $state(false);
	let errors = $state<Record<string, string[]>>({});

	function reset() {
		errors = {};
		loading = false;
	}

	function fieldError(key: string): string | undefined {
		return errors[key]?.[0];
	}

	const sphereOptions = [
		{ value: '', label: '— keine —' },
		{ value: 'ideeller', label: 'Ideell' },
		{ value: 'vermoegen', label: 'Vermögen' },
		{ value: 'zweckbetrieb', label: 'Zweckbetrieb' },
		{ value: 'wirtschaftlich', label: 'Wirtschaftlich' }
	];
</script>

<Dialog.Root
	bind:open
	onOpenChange={(v) => {
		if (!v) reset();
	}}
>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Projekt hinzufügen</Dialog.Title>
			<Dialog.Description>
				Neues Projekt anlegen. Pflichtfeld: Projektname.
			</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			action="?/add"
			use:enhance={() => {
				loading = true;
				errors = {};
				return async ({ result, update }) => {
					loading = false;
					if (result.type === 'failure') {
						errors = (result.data?.errors as Record<string, string[]>) ?? {};
					} else if (result.type === 'success') {
						open = false;
						reset();
						onSuccess?.();
						await update();
					} else {
						await update();
					}
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-1">
				<Label for="add-proj-name">Projektname *</Label>
				<Input
					id="add-proj-name"
					name="name"
					required
					placeholder="z. B. Sommerfest 2026"
					aria-invalid={!!fieldError('name')}
					aria-describedby={fieldError('name') ? 'add-proj-name-err' : undefined}
				/>
				{#if fieldError('name')}
					<p id="add-proj-name-err" class="text-xs text-destructive">{fieldError('name')}</p>
				{/if}
			</div>

			<div class="space-y-1">
				<Label for="add-proj-sphere">Sphäre (Standard)</Label>
				<select
					id="add-proj-sphere"
					name="sphere_default"
					class="border-input bg-background h-9 w-full rounded-lg border px-2.5 py-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
				>
					{#each sphereOptions as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
				{#if fieldError('sphere_default')}
					<p class="text-xs text-destructive">{fieldError('sphere_default')}</p>
				{/if}
			</div>

			<!-- C1-PRJ-A: Default-Kunde combobox. Used by
			     /rechnungen/new?projectId=X to pre-fill the customer FK. -->
			<div class="space-y-1">
				<Label for="add-proj-default-customer">Standard-Kunde (optional)</Label>
				<select
					id="add-proj-default-customer"
					name="default_customer_id"
					class="border-input bg-background h-9 w-full rounded-lg border px-2.5 py-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
					data-testid="project-default-customer"
				>
					<option value="">— Kein Standard-Kunde —</option>
					{#each customers as c (c.id)}
						<option value={c.id}>{c.name}</option>
					{/each}
				</select>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1">
					<Label for="add-proj-start">Startdatum</Label>
					<Input id="add-proj-start" name="start_date" type="date" lang="de" />
				</div>
				<div class="space-y-1">
					<Label for="add-proj-end">Enddatum</Label>
					<Input id="add-proj-end" name="end_date" type="date" lang="de" />
				</div>
			</div>

			<div class="space-y-1">
				<Label for="add-proj-notes">Notizen</Label>
				<textarea
					id="add-proj-notes"
					name="notes"
					rows="3"
					class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
					placeholder="Optionale Notizen zum Projekt"
				></textarea>
			</div>

			{#if errors['_']}
				<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{errors['_']?.[0]}
				</p>
			{/if}

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button variant="outline" type="button" {...props} disabled={loading}>
							Abbrechen
						</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" disabled={loading}>
					{#if loading}
						<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
						</svg>
					{/if}
					Projekt anlegen
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

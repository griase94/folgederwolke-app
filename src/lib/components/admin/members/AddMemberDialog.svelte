<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let {
		open = $bindable(false),
		onSuccess
	}: {
		open: boolean;
		onSuccess?: () => void;
	} = $props();

	let loading = $state(false);
	let errors = $state<Record<string, string[]>>({});

	const todayIso = new Date().toISOString().slice(0, 10);

	function reset() {
		errors = {};
		loading = false;
	}

	function fieldError(key: string): string | undefined {
		return errors[key]?.[0];
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(v) => {
		if (!v) reset();
	}}
>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Mitglied hinzufügen</Dialog.Title>
			<Dialog.Description>
				Neues Mitglied anlegen. Pflichtfelder sind Vor- und Nachname.
			</Dialog.Description>
		</Dialog.Header>

		<form
			method="POST"
			action="?/default"
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
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1">
					<Label for="add-vorname">Vorname *</Label>
					<Input
						id="add-vorname"
						name="vorname"
						required
						autocomplete="given-name"
						aria-invalid={!!fieldError('vorname')}
						aria-describedby={fieldError('vorname') ? 'add-vorname-err' : undefined}
					/>
					{#if fieldError('vorname')}
						<p id="add-vorname-err" class="text-xs text-destructive">{fieldError('vorname')}</p>
					{/if}
				</div>
				<div class="space-y-1">
					<Label for="add-nachname">Nachname *</Label>
					<Input
						id="add-nachname"
						name="nachname"
						required
						autocomplete="family-name"
						aria-invalid={!!fieldError('nachname')}
						aria-describedby={fieldError('nachname') ? 'add-nachname-err' : undefined}
					/>
					{#if fieldError('nachname')}
						<p id="add-nachname-err" class="text-xs text-destructive">{fieldError('nachname')}</p>
					{/if}
				</div>
			</div>

			<div class="space-y-1">
				<Label for="add-email">E-Mail</Label>
				<Input
					id="add-email"
					name="email"
					type="email"
					autocomplete="email"
					aria-invalid={!!fieldError('email')}
				/>
				{#if fieldError('email')}
					<p class="text-xs text-destructive">{fieldError('email')}</p>
				{/if}
			</div>

			<div class="space-y-1">
				<Label for="add-telefon">Telefon</Label>
				<Input id="add-telefon" name="telefon" type="tel" autocomplete="tel" />
			</div>

			<div class="space-y-1">
				<Label for="add-iban">IBAN</Label>
				<Input id="add-iban" name="iban" placeholder="DE12 …" />
				{#if fieldError('iban')}
					<p class="text-xs text-destructive">{fieldError('iban')}</p>
				{/if}
			</div>

			<div class="space-y-1">
				<Label for="add-adresse">Adresse</Label>
				<Input id="add-adresse" name="adresse" autocomplete="street-address" />
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1">
					<Label for="add-dob">Geburtsdatum</Label>
					<Input id="add-dob" name="date_of_birth" type="date" lang="de" />
					{#if fieldError('date_of_birth')}
						<p class="text-xs text-destructive">{fieldError('date_of_birth')}</p>
					{/if}
				</div>
				<div class="space-y-1">
					<Label for="add-eintritt">Eintrittsdatum</Label>
					<Input id="add-eintritt" name="eintritts_datum" type="date" lang="de" value={todayIso} />
				</div>
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
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							/>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
						</svg>
					{/if}
					Hinzufügen
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

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
			<Dialog.Title>Kunden hinzufügen</Dialog.Title>
			<Dialog.Description>
				Neuen Kunden anlegen. Pflichtfeld: Name (Firma oder Person).
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
			<div class="space-y-1">
				<Label for="add-cust-name">Name (Firma / Person) *</Label>
				<Input
					id="add-cust-name"
					name="name"
					required
					placeholder="z. B. Muster GmbH oder Max Mustermann"
					aria-invalid={!!fieldError('name')}
					aria-describedby={fieldError('name') ? 'add-cust-name-err' : undefined}
				/>
				{#if fieldError('name')}
					<p id="add-cust-name-err" class="text-xs text-destructive">{fieldError('name')}</p>
				{/if}
			</div>

			<div class="space-y-1">
				<Label for="add-cust-anrede">Anrede</Label>
				<Input
					id="add-cust-anrede"
					name="anrede"
					placeholder='z. B. „Liebe Maria" oder „Sehr geehrte Damen und Herren"'
				/>
				{#if fieldError('anrede')}
					<p class="text-xs text-destructive">{fieldError('anrede')}</p>
				{/if}
			</div>

			<div class="space-y-1">
				<Label for="add-cust-email">E-Mail</Label>
				<Input
					id="add-cust-email"
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
				<Label for="add-cust-address">Adressblock</Label>
				<textarea
					id="add-cust-address"
					name="address_block"
					rows="4"
					class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
					placeholder="Mehrzellige Adresse für den Rechnungskopf"
				></textarea>
				{#if fieldError('address_block')}
					<p class="text-xs text-destructive">{fieldError('address_block')}</p>
				{/if}
			</div>

			<div class="space-y-1">
				<Label for="add-cust-notes">Notizen</Label>
				<textarea
					id="add-cust-notes"
					name="notes"
					rows="2"
					class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
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
					Kunden anlegen
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

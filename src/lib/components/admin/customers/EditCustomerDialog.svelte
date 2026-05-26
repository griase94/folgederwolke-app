<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';
	import type { CustomerView } from '$lib/server/domain/customers.js';

	let {
		open = $bindable(false),
		customer,
		onSuccess
	}: {
		open: boolean;
		customer: CustomerView | null;
		onSuccess?: () => void;
	} = $props();

	let loading = $state(false);
	let deleteLoading = $state(false);
	let errors = $state<Record<string, string[]>>({});
	let confirmDelete = $state(false);
	let deleteError = $state<string | null>(null);

	function reset() {
		errors = {};
		loading = false;
		deleteLoading = false;
		confirmDelete = false;
		deleteError = null;
	}

	$effect(() => {
		if (!open) reset();
	});

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
			<Dialog.Title>Kunden bearbeiten</Dialog.Title>
			{#if customer}
				<Dialog.Description>{customer.name}</Dialog.Description>
			{/if}
		</Dialog.Header>

		{#if customer}
			<form
				id="delete-customer-form"
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleteLoading = true;
					deleteError = null;
					const customerId = customer?.id ?? '';
					return async ({ result }) => {
						deleteLoading = false;
						if (result.type === 'success') {
							// Soft-undo toast (UX-050): undo within ~8s via ?/restore.
							const toastId = toast.success('Kunde archiviert', {
								action: {
									label: 'Rückgängig',
									onClick: async () => {
										const fd = new FormData();
										fd.set('id', customerId);
										await fetch('?/restore', { method: 'POST', body: fd });
										await invalidateAll();
										toast.dismiss(toastId);
										toast.info('Wiederhergestellt');
									},
								},
								duration: 8000,
							});
							open = false;
							reset();
							onSuccess?.();
							await invalidateAll();
						} else if (result.type === 'failure') {
							const msg = (result.data?.error as string | undefined) ?? 'Archivieren fehlgeschlagen';
							deleteError = msg;
							toast.error(msg);
						} else if (result.type === 'error') {
							const msg = result.error?.message ?? 'Archivieren fehlgeschlagen';
							deleteError = msg;
							toast.error(msg);
						}
					};
				}}
			>
				<input type="hidden" name="id" value={customer.id} />
			</form>

			<form
				method="POST"
				action="?/edit"
				use:enhance={() => {
					loading = true;
					errors = {};
					return async ({ result, update }) => {
						loading = false;
						if (result.type === 'failure') {
							errors = (result.data?.errors as Record<string, string[]>) ?? {};
						} else if (result.type === 'success') {
							toast.success('Kunde aktualisiert');
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
				<input type="hidden" name="id" value={customer.id} />

				<div class="space-y-1">
					<Label for="edit-cust-name">Name (Firma / Person) *</Label>
					<Input
						id="edit-cust-name"
						name="name"
						required
						value={customer.name}
						aria-invalid={!!fieldError('name')}
					/>
					{#if fieldError('name')}
						<p class="text-xs text-destructive">{fieldError('name')}</p>
					{/if}
				</div>

				<div class="space-y-1">
					<Label for="edit-cust-anrede">Anrede</Label>
					<Input
						id="edit-cust-anrede"
						name="anrede"
						value={customer.anrede ?? ''}
					/>
				</div>

				<div class="space-y-1">
					<Label for="edit-cust-email">E-Mail</Label>
					<Input
						id="edit-cust-email"
						name="email"
						type="email"
						value={customer.email ?? ''}
						aria-invalid={!!fieldError('email')}
					/>
					{#if fieldError('email')}
						<p class="text-xs text-destructive">{fieldError('email')}</p>
					{/if}
				</div>

				<div class="space-y-1">
					<Label for="edit-cust-address">Adressblock</Label>
					<textarea
						id="edit-cust-address"
						name="address_block"
						rows="4"
						class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
					>{customer.addressBlock ?? ''}</textarea>
					{#if fieldError('address_block')}
						<p class="text-xs text-destructive">{fieldError('address_block')}</p>
					{/if}
				</div>

				<div class="space-y-1">
					<Label for="edit-cust-country">Land</Label>
					<select
						id="edit-cust-country"
						name="country"
						class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
					>
						{#each [
							['DE', 'Deutschland'],
							['AT', 'Österreich'],
							['CH', 'Schweiz'],
							['FR', 'Frankreich'],
							['IT', 'Italien'],
							['NL', 'Niederlande'],
							['BE', 'Belgien'],
							['LU', 'Luxemburg'],
							['GB', 'Vereinigtes Königreich'],
							['US', 'Vereinigte Staaten'],
							['ES', 'Spanien'],
						] as [code, label] (code)}
							<option value={code} selected={(customer.country ?? 'DE') === code}>{label}</option>
						{/each}
					</select>
					<p class="text-xs text-muted-foreground">Auf der Rechnung nur angezeigt, wenn nicht Deutschland.</p>
					{#if fieldError('country')}
						<p class="text-xs text-destructive">{fieldError('country')}</p>
					{/if}
				</div>

				<div class="space-y-1">
					<Label for="edit-cust-notes">Notizen</Label>
					<textarea
						id="edit-cust-notes"
						name="notes"
						rows="2"
						class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
					>{customer.notes ?? ''}</textarea>
				</div>

				{#if errors['_']}
					<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{errors['_']?.[0]}
					</p>
				{/if}

				{#if deleteError}
					<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{deleteError}
					</p>
				{/if}

				<Dialog.Footer class="flex-col gap-2 sm:flex-row sm:justify-between">
					<div>
						{#if !customer.isFixture}
							{#if !confirmDelete}
								<Button
									type="button"
									variant="ghost"
									class="text-destructive hover:bg-destructive/10 hover:text-destructive"
									onclick={() => (confirmDelete = true)}
									disabled={loading || deleteLoading}
								>
									Archivieren
								</Button>
							{:else}
								<span class="text-sm text-muted-foreground">Wirklich archivieren?</span>
								<Button
									type="submit"
									form="delete-customer-form"
									variant="destructive"
									class="ml-2"
									disabled={deleteLoading}
								>
									{deleteLoading ? 'Wird archiviert…' : 'Ja, archivieren'}
								</Button>
								<Button
									type="button"
									variant="ghost"
									class="ml-1"
									onclick={() => (confirmDelete = false)}
								>
									Abbrechen
								</Button>
							{/if}
						{/if}
					</div>

					<div class="flex gap-2">
						<Dialog.Close>
							{#snippet child({ props })}
								<Button variant="outline" type="button" {...props} disabled={loading}>
									Abbrechen
								</Button>
							{/snippet}
						</Dialog.Close>
						<Button type="submit" disabled={loading || deleteLoading}>
							{#if loading}
								<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
								</svg>
							{/if}
							Speichern
						</Button>
					</div>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { undoToast } from '$lib/components/ui/sonner/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import CustomerFormFields from './CustomerFormFields.svelte';
	import type { CustomerView } from '$lib/server/domain/customers.js';

	let {
		open = $bindable(false),
		customer,
		startInArchiveMode = false,
		onSuccess
	}: {
		open: boolean;
		customer: CustomerView | null;
		/** When true the dialog opens straight on the archive-confirm surface
		 *  (list kebab → Archivieren). */
		startInArchiveMode?: boolean;
		onSuccess?: () => void;
	} = $props();

	let loading = $state(false);
	let deleteLoading = $state(false);
	let errors = $state<Record<string, string[]>>({});
	let deleteError = $state<string | null>(null);
	/** false = edit form; true = archive-confirm surface (kit critical mode). */
	let archiveMode = $state(false);
	let archiveConfirmed = $state(false);
	let name = $state('');

	function reset() {
		errors = {};
		loading = false;
		deleteLoading = false;
		deleteError = null;
		archiveMode = false;
		archiveConfirmed = false;
	}

	$effect(() => {
		if (open) {
			// Opening: honour the requested initial surface (list "Archivieren"
			// jumps straight to the confirm; "Bearbeiten" starts on the form).
			archiveMode = startInArchiveMode;
			archiveConfirmed = false;
		} else {
			reset();
		}
	});

	const canSave = $derived(name.trim().length > 0 && !loading && !deleteLoading);
</script>

<Dialog.Root
	bind:open
	onOpenChange={(v) => {
		if (!v) reset();
	}}
>
	<Dialog.Content
		showCloseButton={false}
		class="gap-0 overflow-hidden p-0 sm:max-w-[460px] max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:w-full max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none"
	>
		{#if customer}
			<!-- brand accent bar — turns critical-red in archive mode -->
			<div class="h-1 w-full {archiveMode ? 'bg-severity-critical' : 'bg-gradient-brand'}" aria-hidden="true"></div>
			<div class="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-ink-300/60 sm:hidden" aria-hidden="true"></div>

			<!-- header -->
			<div class="flex items-center gap-3 border-b border-hairline px-5 py-4">
				{#if archiveMode}
					<div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-severity-critical/12 text-severity-critical-text" aria-hidden="true">
						<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect width="20" height="5" x="2" y="3" rx="1" /><path stroke-linecap="round" stroke-linejoin="round" d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8M10 12h4" /></svg>
					</div>
				{:else}
					<div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-brand-soft text-primary-text" aria-hidden="true">
						<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 21V5a2 2 0 012-2h8a2 2 0 012 2v16M6 10H4a2 2 0 00-2 2v7a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-2M10 8h4m-4 4h4m-4 9v-3a2 2 0 014 0v3" /></svg>
					</div>
				{/if}
				<div class="min-w-0">
					<Dialog.Title class="text-lg font-bold tracking-tight text-ink-900">
						{archiveMode ? 'Kunde archivieren' : 'Kunde bearbeiten'}
					</Dialog.Title>
					<Dialog.Description class="truncate text-xs text-ink-500">{customer.name}</Dialog.Description>
				</div>
				<Dialog.Close
					class="ml-auto grid h-9 w-9 shrink-0 place-items-center self-start rounded-lg border border-border text-ink-500 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Schließen"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
				</Dialog.Close>
			</div>

			<!-- hidden delete form — submitted by the armed danger button -->
			<form
				id="delete-customer-form"
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleteLoading = true;
					deleteError = null;
					const archivedName = customer?.name ?? 'Kunde';
					const archivedId = customer?.id ?? '';
					return async ({ result }) => {
						deleteLoading = false;
						if (result.type === 'success') {
							open = false;
							reset();
							onSuccess?.();
							await invalidateAll();
							// Soft-undo (UX-050): 8s window, POST ?/restore reverts.
							undoToast(`${archivedName} archiviert`, {
								onUndo: async () => {
									const fd = new FormData();
									fd.set('id', archivedId);
									await fetch('?/restore', { method: 'POST', body: fd });
									await invalidateAll();
									toast.info(`${archivedName} wiederhergestellt`);
								}
							});
						} else if (result.type === 'failure') {
							deleteError = (result.data?.error as string | undefined) ?? 'Archivieren fehlgeschlagen';
						} else if (result.type === 'error') {
							deleteError = result.error?.message ?? 'Archivieren fehlgeschlagen';
						}
					};
				}}
			>
				<input type="hidden" name="id" value={customer.id} />
			</form>

			{#if archiveMode}
				<!-- ── archive-confirm surface ─────────────────────────────── -->
				<div class="flex flex-col gap-3.5 px-5 py-5">
					<div class="flex items-start gap-3 rounded-xl border border-hairline bg-muted px-4 py-3">
						<svg class="mt-px h-5 w-5 shrink-0 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4M12 8h.01" /></svg>
						<div class="text-sm leading-relaxed text-ink-700">
							<p class="font-semibold text-ink-900">Archivieren ist kein Löschen.</p>
							<p class="mt-0.5 text-ink-500">Der Kunde verschwindet aus der Liste, bleibt in allen alten Rechnungen aber erhalten. Rückgängig geht per „Wiederherstellen“.</p>
						</div>
					</div>
					<label class="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors {archiveConfirmed ? 'border-severity-critical/40 bg-severity-critical/8' : 'border-border bg-card'}">
						<input type="checkbox" bind:checked={archiveConfirmed} data-testid="archive-confirm-check" class="h-4 w-4 shrink-0 accent-severity-critical" />
						<span class="text-sm font-medium text-ink-900">Ja, <b class="font-semibold">{customer.name}</b> archivieren.</span>
					</label>
					{#if deleteError}
						<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{deleteError}</p>
					{/if}
				</div>
				<div class="flex flex-col-reverse gap-2 border-t border-hairline px-5 py-4 sm:flex-row sm:justify-end">
					<Button variant="outline" type="button" onclick={() => (archiveMode = false)} disabled={deleteLoading} class="sm:w-auto">Abbrechen</Button>
					<Button
						type="submit"
						form="delete-customer-form"
						variant="destructive"
						disabled={!archiveConfirmed || deleteLoading}
						data-testid="archive-submit"
						class="sm:w-auto"
					>
						{#if deleteLoading}
							<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
							Wird archiviert …
						{:else}
							Jetzt archivieren
						{/if}
					</Button>
				</div>
			{:else}
				<!-- ── edit form ────────────────────────────────────────────── -->
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
								toast.success(`${name.trim() || customer?.name} gespeichert`);
								open = false;
								reset();
								onSuccess?.();
								await update();
							} else {
								await update();
							}
						};
					}}
				>
					<input type="hidden" name="id" value={customer.id} />
					<div class="flex max-h-[70vh] flex-col gap-3.5 overflow-y-auto px-5 py-5 max-sm:max-h-[62vh]">
						<CustomerFormFields idPrefix="edit-cust" values={customer} {errors} bind:name />
						{#if errors['_']}
							<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errors['_']?.[0]}</p>
						{/if}
					</div>

					<div class="flex flex-col gap-3 border-t border-hairline px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
						<!-- archive zone (hard-left) — only for non-fixture customers -->
						<div>
							{#if !customer.isFixture}
								<Button
									type="button"
									variant="ghost"
									class="text-severity-critical-text hover:bg-severity-critical/10 hover:text-severity-critical-text max-sm:w-full"
									onclick={() => (archiveMode = true)}
									disabled={loading}
								>
									<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect width="20" height="5" x="2" y="3" rx="1" /><path stroke-linecap="round" stroke-linejoin="round" d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8M10 12h4" /></svg>
									Kunde archivieren…
								</Button>
							{/if}
						</div>
						<div class="flex flex-col-reverse gap-2 sm:flex-row">
							<Dialog.Close>
								{#snippet child({ props })}
									<Button variant="outline" type="button" {...props} disabled={loading} class="sm:w-auto">Abbrechen</Button>
								{/snippet}
							</Dialog.Close>
							<Button type="submit" disabled={!canSave} class="sm:w-auto">
								{#if loading}
									<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
									Wird gespeichert …
								{:else}
									Speichern
								{/if}
							</Button>
						</div>
					</div>
				</form>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>

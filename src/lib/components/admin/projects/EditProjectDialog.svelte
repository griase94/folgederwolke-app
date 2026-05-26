<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';
	import type { ProjectView } from '$lib/server/domain/projects.js';

	let {
		open = $bindable(false),
		project,
		customers = [],
		onSuccess
	}: {
		open: boolean;
		project: ProjectView | null;
		/** C1-PRJ-A: customer list for the Default-Kunde combobox. */
		customers?: Array<{ id: string; name: string }>;
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
			<Dialog.Title>Projekt bearbeiten</Dialog.Title>
			{#if project}
				<Dialog.Description>{project.name}</Dialog.Description>
			{/if}
		</Dialog.Header>

		{#if project}
			<form
				id="delete-project-form"
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleteLoading = true;
					deleteError = null;
					const projectId = project?.id ?? '';
					return async ({ result }) => {
						deleteLoading = false;
						if (result.type === 'success') {
							// Soft-undo toast (UX-050): the destructive op is reversible
							// for ~8s via the project's restore action.
							const toastId = toast.success('Projekt archiviert', {
								action: {
									label: 'Rückgängig',
									onClick: async () => {
										const fd = new FormData();
										fd.set('id', projectId);
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
				<input type="hidden" name="id" value={project.id} />
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
							toast.success('Projekt aktualisiert');
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
				<input type="hidden" name="id" value={project.id} />

				<div class="space-y-1">
					<Label for="edit-proj-name">Projektname *</Label>
					<Input
						id="edit-proj-name"
						name="name"
						required
						value={project.name}
						aria-invalid={!!fieldError('name')}
					/>
					{#if fieldError('name')}
						<p class="text-xs text-destructive">{fieldError('name')}</p>
					{/if}
				</div>

				<div class="space-y-1">
					<Label for="edit-proj-sphere">Sphäre (Standard)</Label>
					<select
						id="edit-proj-sphere"
						name="sphere_default"
						class="border-input bg-background h-9 w-full rounded-lg border px-2.5 py-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
					>
						{#each sphereOptions as opt (opt.value)}
							<option value={opt.value} selected={project.sphereDefault === opt.value || (!project.sphereDefault && opt.value === '')}>
								{opt.label}
							</option>
						{/each}
					</select>
				</div>

				<!-- C1-PRJ-A: Default-Kunde combobox. /rechnungen/new?projectId=X
				     uses this FK to pre-fill the customer picker. -->
				<div class="space-y-1">
					<Label for="edit-proj-default-customer">Standard-Kunde (optional)</Label>
					<select
						id="edit-proj-default-customer"
						name="default_customer_id"
						class="border-input bg-background h-9 w-full rounded-lg border px-2.5 py-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
						data-testid="project-default-customer"
					>
						<option value="" selected={!project.defaultCustomerId}>— Kein Standard-Kunde —</option>
						{#each customers as c (c.id)}
							<option value={c.id} selected={project.defaultCustomerId === c.id}>{c.name}</option>
						{/each}
					</select>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1">
						<Label for="edit-proj-start">Startdatum</Label>
						<Input id="edit-proj-start" name="start_date" type="date" lang="de" value={project.startDate ?? ''} />
					</div>
					<div class="space-y-1">
						<Label for="edit-proj-end">Enddatum</Label>
						<Input id="edit-proj-end" name="end_date" type="date" lang="de" value={project.endDate ?? ''} />
					</div>
				</div>

				<div class="space-y-1">
					<Label for="edit-proj-notes">Notizen</Label>
					<textarea
						id="edit-proj-notes"
						name="notes"
						rows="3"
						class="border-input bg-background focus-visible:ring-ring/50 w-full rounded-lg border px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
					>{project.notes ?? ''}</textarea>
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
						{#if !project.isFixture}
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
									form="delete-project-form"
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

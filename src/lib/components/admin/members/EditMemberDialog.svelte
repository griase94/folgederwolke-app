<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { MemberView } from '$lib/domain/members.js';

	let {
		open = $bindable(false),
		member,
		onSuccess
	}: {
		open: boolean;
		member: MemberView | null;
		onSuccess?: () => void;
	} = $props();

	let loading = $state(false);
	let deleteLoading = $state(false);
	let errors = $state<Record<string, string[]>>({});
	let confirmDelete = $state(false);

	function reset() {
		errors = {};
		loading = false;
		deleteLoading = false;
		confirmDelete = false;
	}

	$effect(() => {
		if (!open) reset();
	});

	function fieldError(key: string): string | undefined {
		return errors[key]?.[0];
	}

	async function handleDelete() {
		if (!member) return;
		deleteLoading = true;
		const fd = new FormData();
		fd.append('id', member.id);
		await fetch('?/delete', { method: 'POST', body: fd });
		deleteLoading = false;
		open = false;
		onSuccess?.();
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
			<Dialog.Title>Mitglied bearbeiten</Dialog.Title>
			{#if member}
				<Dialog.Description>
					{member.vorname}
					{member.nachname}
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		{#if member}
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
				<input type="hidden" name="id" value={member.id} />

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1">
						<Label for="edit-vorname">Vorname *</Label>
						<Input
							id="edit-vorname"
							name="vorname"
							required
							value={member.vorname}
							aria-invalid={!!fieldError('vorname')}
						/>
						{#if fieldError('vorname')}
							<p class="text-xs text-destructive">{fieldError('vorname')}</p>
						{/if}
					</div>
					<div class="space-y-1">
						<Label for="edit-nachname">Nachname *</Label>
						<Input
							id="edit-nachname"
							name="nachname"
							required
							value={member.nachname}
							aria-invalid={!!fieldError('nachname')}
						/>
						{#if fieldError('nachname')}
							<p class="text-xs text-destructive">{fieldError('nachname')}</p>
						{/if}
					</div>
				</div>

				<div class="space-y-1">
					<Label for="edit-email">E-Mail</Label>
					<Input
						id="edit-email"
						name="email"
						type="email"
						value={member.email ?? ''}
						aria-invalid={!!fieldError('email')}
					/>
					{#if fieldError('email')}
						<p class="text-xs text-destructive">{fieldError('email')}</p>
					{/if}
				</div>

				<div class="space-y-1">
					<Label for="edit-iban">IBAN</Label>
					<Input id="edit-iban" name="iban" value={member.iban ?? ''} placeholder="DE12 …" />
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1">
						<Label for="edit-eintritt">Eintrittsdatum</Label>
						<Input
							id="edit-eintritt"
							name="eintritts_datum"
							type="date"
							value={member.eintrittsDatum ?? ''}
						/>
					</div>
					<div class="space-y-1">
						<Label for="edit-role">Rolle</Label>
						<select
							id="edit-role"
							name="role"
							class="border-input bg-background h-8 w-full rounded-lg border px-2.5 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{#each ['mitglied', 'vorstand', 'kassenwart', 'schriftfuehrer', 'fördermitglied'] as r (r)}
								<option value={r} selected={member.role === r}>{r}</option>
							{/each}
						</select>
					</div>
				</div>

				{#if errors['_']}
					<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{errors['_']?.[0]}
					</p>
				{/if}

				<Dialog.Footer class="flex-col gap-2 sm:flex-row sm:justify-between">
					<div>
						{#if !confirmDelete}
							<Button
								type="button"
								variant="ghost"
								class="text-destructive hover:bg-destructive/10 hover:text-destructive"
								onclick={() => (confirmDelete = true)}
								disabled={loading || deleteLoading}
							>
								Mitglied löschen
							</Button>
						{:else}
							<span class="text-sm text-muted-foreground">Wirklich löschen?</span>
							<Button
								type="button"
								variant="destructive"
								class="ml-2"
								disabled={deleteLoading}
								onclick={handleDelete}
							>
								{deleteLoading ? 'Wird gelöscht…' : 'Ja, löschen'}
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
							Speichern
						</Button>
					</div>
				</Dialog.Footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

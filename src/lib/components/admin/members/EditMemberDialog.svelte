<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { toast } from 'svelte-sonner';
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
	let deleteError = $state<string | null>(null);

	// Night-2 C5-MEM-full — exempt toggle drives the reason input visibility.
	// Synced from `member.beitragExempt` whenever the dialog opens (or the
	// member prop changes) so editing pre-fills the checkbox state.
	let beitragExempt = $state(false);

	function reset() {
		errors = {};
		loading = false;
		deleteLoading = false;
		confirmDelete = false;
		deleteError = null;
		beitragExempt = member?.beitragExempt ?? false;
	}

	$effect(() => {
		if (!open) reset();
	});

	$effect(() => {
		// Keep the toggle in sync with the freshly-passed member prop.
		if (member) beitragExempt = member.beitragExempt ?? false;
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
			<Dialog.Title>Mitglied bearbeiten</Dialog.Title>
			{#if member}
				<Dialog.Description>
					{member.vorname}
					{member.nachname}
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		{#if member}
			<!--
				Soft-delete form — sibling to the edit form so we can use SvelteKit's
				`use:enhance` for proper action-result handling (toast + invalidate).
				Buttons inside the edit form reference this one via `form="delete-member-form"`.
			-->
			<form
				id="delete-member-form"
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleteLoading = true;
					deleteError = null;
					const memberId = member?.id ?? '';
					return async ({ result }) => {
						deleteLoading = false;
						if (result.type === 'success') {
							// Soft-undo toast (UX-050): the soft-delete sets austrittsDatum;
							// the undo clears it via the page action ?/restore.
							const toastId = toast.success('Mitglied archiviert', {
								action: {
									label: 'Rückgängig',
									onClick: async () => {
										const fd = new FormData();
										fd.set('id', memberId);
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
							const msg =
								(result.data?.error as string | undefined) ?? 'Löschen fehlgeschlagen';
							deleteError = msg;
							toast.error(msg);
						} else if (result.type === 'error') {
							const msg = result.error?.message ?? 'Löschen fehlgeschlagen';
							deleteError = msg;
							toast.error(msg);
						}
					};
				}}
			>
				<input type="hidden" name="id" value={member.id} />
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
							toast.success('Mitglied aktualisiert');
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
					{#if fieldError('iban')}
						<p class="text-xs text-destructive">{fieldError('iban')}</p>
					{/if}
				</div>

				<div class="space-y-1">
					<Label for="edit-telefon">Telefon</Label>
					<Input
						id="edit-telefon"
						name="telefon"
						type="tel"
						value={member.telefon ?? ''}
						autocomplete="tel"
					/>
				</div>

				<div class="space-y-1">
					<Label for="edit-adresse">Adresse</Label>
					<Input
						id="edit-adresse"
						name="adresse"
						value={member.adresse ?? ''}
						autocomplete="street-address"
					/>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1">
						<Label for="edit-dob">Geburtsdatum</Label>
						<Input
							id="edit-dob"
							name="date_of_birth"
							type="date"
							lang="de"
							value={member.dateOfBirth ?? ''}
						/>
						{#if fieldError('date_of_birth')}
							<p class="text-xs text-destructive">{fieldError('date_of_birth')}</p>
						{/if}
					</div>
					<div class="space-y-1">
						<Label for="edit-eintritt">Eintrittsdatum</Label>
						<Input
							id="edit-eintritt"
							name="eintritts_datum"
							type="date"
							lang="de"
							value={member.eintrittsDatum ?? ''}
						/>
					</div>
				</div>

				<div class="space-y-1">
					<Label for="edit-role">Rolle</Label>
					<select
						id="edit-role"
						name="role"
						data-testid="edit-role-select"
						class="border-input bg-background h-8 w-full rounded-lg border px-2.5 py-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
					>
						{#each ['mitglied', 'vorstand', 'kassenwart', 'schriftfuehrer', 'fördermitglied', 'extern', 'helfer'] as r (r)}
							<option value={r} selected={member.role === r}>{r}</option>
						{/each}
					</select>
				</div>

				<!-- Night-2 C5-MEM-full — Beitragspflicht aussetzen + Begründung -->
				<div class="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
					<label class="flex items-start gap-2 text-sm">
						<input
							id="edit-beitrag-exempt"
							type="checkbox"
							name="beitrag_exempt"
							data-testid="edit-beitrag-exempt"
							class="mt-0.5 h-4 w-4 rounded border-input"
							bind:checked={beitragExempt}
						/>
						<span>
							<span class="font-medium text-foreground">Beitragspflicht aussetzen</span>
							<span class="block text-xs text-muted-foreground">
								Mitglied zählt nicht in den „offen"-Summen.
							</span>
						</span>
					</label>
					{#if beitragExempt}
						<div class="space-y-1">
							<Label for="edit-exempt-reason">Begründung</Label>
							<Input
								id="edit-exempt-reason"
								name="beitrag_exempt_reason"
								placeholder="z.B. Ehrenmitglied, Härtefall"
								value={member.beitragExemptReason ?? ''}
							/>
						</div>
					{/if}
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
							<!--
								Submits the sibling `delete-member-form` via the HTML5 `form`
								attribute. This keeps `use:enhance` semantics (no nested forms).
							-->
							<Button
								type="submit"
								form="delete-member-form"
								variant="destructive"
								class="ml-2"
								disabled={deleteLoading}
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

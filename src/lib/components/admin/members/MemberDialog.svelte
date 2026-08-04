<script lang="ts">
	/**
	 * MemberDialog — ONE dialog for anlegen + bearbeiten (modal-mitglied brief,
	 * Ruling: VEREINEN). Replaces AddMemberDialog + EditMemberDialog ersatzlos
	 * (no shim). `mode` selects title / action / CTA / prefill; edit adds the id +
	 * the Austritts-Zone. Pure presentation rebase — no backend delta (schema,
	 * ?/add, ?/edit, ?/delete, ?/restore all exist).
	 *
	 * Vocabulary is "austragen" (Soft-Delete + Undo), never "löschen" — there is
	 * no hard-delete path (brief AC5). testids preserve continuity from both old
	 * dialogs: `{mode}-role-select`, `{mode}-beitrag-exempt`.
	 */
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import DateField from '$lib/components/ui/date-field/DateField.svelte';
	import { toast } from 'svelte-sonner';
	import { berlinYmd } from '$lib/domain/year.js';
	import type { MemberView } from '$lib/domain/members.js';

	let {
		open = $bindable(false),
		mode,
		member = null,
		onSuccess
	}: {
		open?: boolean;
		mode: 'add' | 'edit';
		/** Required for edit; ignored for add. */
		member?: MemberView | null;
		onSuccess?: () => void;
	} = $props();

	const isEdit = $derived(mode === 'edit');

	let loading = $state(false);
	let deleteLoading = $state(false);
	let errors = $state<Record<string, string[]>>({});
	let confirmAustragen = $state(false);

	let beitragExempt = $state(false);
	let beitragExemptReason = $state('');

	function reset() {
		errors = {};
		loading = false;
		deleteLoading = false;
		confirmAustragen = false;
		beitragExempt = member?.beitragExempt ?? false;
		beitragExemptReason = member?.beitragExemptReason ?? '';
	}

	$effect(() => {
		if (!open) reset();
	});

	// Keep the exemption toggle in sync with a freshly-passed member (edit).
	$effect(() => {
		if (member) {
			beitragExempt = member.beitragExempt ?? false;
			beitragExemptReason = member.beitragExemptReason ?? '';
		}
	});

	// §55 AO: block submit while exemption is on without a Grund (client mirror of
	// the server superRefine + DB CHECK).
	const exemptReasonMissing = $derived(
		beitragExempt && beitragExemptReason.trim().length === 0
	);

	function fieldError(key: string): string | undefined {
		return errors[key]?.[0];
	}

	const roleOptions = [
		{ value: 'mitglied', label: 'Mitglied' },
		{ value: 'vorstand', label: 'Vorstand' },
		{ value: 'kassenwart', label: 'Kassenwart' },
		{ value: 'schriftfuehrer', label: 'Schriftführer' },
		{ value: 'fördermitglied', label: 'Fördermitglied' },
		{ value: 'extern', label: 'Extern' },
		{ value: 'helfer', label: 'Helfer' }
	] as const;

	const eintrittDefault = $derived(isEdit ? (member?.eintrittsDatum ?? '') : berlinYmd());
</script>

<Dialog.Root
	bind:open
	onOpenChange={(v) => {
		if (!v) reset();
	}}
>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="member-dialog">
		<Dialog.Header>
			<Dialog.Title>{isEdit ? 'Mitglied bearbeiten' : 'Mitglied hinzufügen'}</Dialog.Title>
			<Dialog.Description>
				{#if isEdit && member}
					{member.vorname} {member.nachname}
				{:else}
					Neues Mitglied anlegen. Pflicht sind nur Vor- und Nachname.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		{#if isEdit && member}
			<!-- Soft-delete (austragen) form — sibling so use:enhance owns the result
			     (undo snack + invalidate). The danger button references it via form=. -->
			<form
				id="austragen-form"
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleteLoading = true;
					const memberId = member?.id ?? '';
					const name = `${member?.vorname ?? ''} ${member?.nachname ?? ''}`.trim();
					return async ({ result }) => {
						deleteLoading = false;
						if (result.type === 'success') {
							const toastId = toast.success(`${name} ausgetragen`, {
								action: {
									label: 'Rückgängig',
									onClick: async () => {
										const fd = new FormData();
										fd.set('id', memberId);
										await fetch('?/restore', { method: 'POST', body: fd });
										await invalidateAll();
										toast.dismiss(toastId);
										toast.info('Wiederhergestellt');
									}
								},
								duration: 8000
							});
							open = false;
							reset();
							onSuccess?.();
							await invalidateAll();
						} else if (result.type === 'failure') {
							toast.error((result.data?.error as string | undefined) ?? 'Austragen fehlgeschlagen');
						} else if (result.type === 'error') {
							toast.error(result.error?.message ?? 'Austragen fehlgeschlagen');
						}
					};
				}}
			>
				<input type="hidden" name="id" value={member.id} />
			</form>
		{/if}

		<form
			method="POST"
			action={isEdit ? '?/edit' : '?/add'}
			use:enhance={() => {
				loading = true;
				errors = {};
				return async ({ result, update }) => {
					loading = false;
					if (result.type === 'failure') {
						errors = (result.data?.errors as Record<string, string[]>) ?? {};
					} else if (result.type === 'error') {
						errors = {
							_: ['Speichern hat nicht geklappt — deine Eingaben sind noch da.']
						};
					} else if (result.type === 'success') {
						toast.success(isEdit ? 'Mitglied aktualisiert' : 'Mitglied angelegt');
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
			{#if isEdit && member}
				<input type="hidden" name="id" value={member.id} />
			{/if}

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1">
					<Label for="m-vorname">Vorname *</Label>
					<Input
						id="m-vorname"
						name="vorname"
						required
						autocomplete="given-name"
						value={isEdit ? (member?.vorname ?? '') : ''}
						aria-invalid={!!fieldError('vorname')}
						aria-describedby={fieldError('vorname') ? 'm-vorname-err' : undefined}
					/>
					{#if fieldError('vorname')}
						<p id="m-vorname-err" class="text-xs text-destructive">{fieldError('vorname')}</p>
					{/if}
				</div>
				<div class="space-y-1">
					<Label for="m-nachname">Nachname *</Label>
					<Input
						id="m-nachname"
						name="nachname"
						required
						autocomplete="family-name"
						value={isEdit ? (member?.nachname ?? '') : ''}
						aria-invalid={!!fieldError('nachname')}
						aria-describedby={fieldError('nachname') ? 'm-nachname-err' : undefined}
					/>
					{#if fieldError('nachname')}
						<p id="m-nachname-err" class="text-xs text-destructive">{fieldError('nachname')}</p>
					{/if}
				</div>
			</div>

			<div class="space-y-1">
				<Label for="m-email">E-Mail</Label>
				<Input
					id="m-email"
					name="email"
					type="email"
					autocomplete="email"
					value={isEdit ? (member?.email ?? '') : ''}
					aria-invalid={!!fieldError('email')}
				/>
				{#if fieldError('email')}
					<p class="text-xs text-destructive">{fieldError('email')}</p>
				{/if}
			</div>

			<div class="space-y-1">
				<Label for="m-iban">IBAN</Label>
				<Input id="m-iban" name="iban" placeholder="DE12 …" value={isEdit ? (member?.iban ?? '') : ''} />
				{#if fieldError('iban')}
					<p class="text-xs text-destructive">{fieldError('iban')}</p>
				{/if}
			</div>

			<div class="space-y-1">
				<Label for="m-telefon">Telefon</Label>
				<Input
					id="m-telefon"
					name="telefon"
					type="tel"
					autocomplete="tel"
					value={isEdit ? (member?.telefon ?? '') : ''}
				/>
			</div>

			<div class="space-y-1">
				<Label for="m-adresse">Adresse</Label>
				<Input
					id="m-adresse"
					name="adresse"
					autocomplete="street-address"
					value={isEdit ? (member?.adresse ?? '') : ''}
				/>
			</div>

			<!-- Both dates use the locale-locked DateField (ISO hidden mirror keeps
			     the server field names date_of_birth + eintritts_datum). -->
			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1">
					<Label for="m-dob">Geburtsdatum</Label>
					<DateField
						id="m-dob"
						name="date_of_birth"
						value={isEdit ? (member?.dateOfBirth ?? '') : ''}
						aria-invalid={!!fieldError('date_of_birth')}
					/>
					{#if fieldError('date_of_birth')}
						<p class="text-xs text-destructive">{fieldError('date_of_birth')}</p>
					{/if}
				</div>
				<div class="space-y-1">
					<Label for="m-eintritt">Eintrittsdatum</Label>
					<DateField
						id="m-eintritt"
						name="eintritts_datum"
						value={eintrittDefault}
						aria-invalid={!!fieldError('eintritts_datum')}
					/>
				</div>
			</div>

			<div class="space-y-1">
				<Label for="m-role">Rolle</Label>
				<select
					id="m-role"
					name="role"
					data-testid="{mode}-role-select"
					class="border-input bg-background h-9 w-full rounded-lg border px-2.5 py-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
				>
					{#each roleOptions as r (r.value)}
						<option value={r.value} selected={isEdit && member?.role === r.value}>{r.label}</option>
					{/each}
				</select>
			</div>

			<!-- Beitragspflicht aussetzen (indigo, never pink, never on the Betrag) -->
			<div
				class="space-y-2 rounded-lg border p-3 transition-colors {beitragExempt
					? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10'
					: 'border-border bg-muted/30'}"
			>
				<label class="flex items-start gap-2 text-sm">
					<input
						id="m-beitrag-exempt"
						type="checkbox"
						name="beitrag_exempt"
						data-testid="{mode}-beitrag-exempt"
						class="mt-0.5 h-4 w-4 rounded border-input accent-indigo-600"
						bind:checked={beitragExempt}
					/>
					<span>
						<span class="font-medium text-foreground">Beitragspflicht dauerhaft aussetzen</span>
						<span class="block text-xs text-muted-foreground">
							Mitglied zählt nicht in den „offen"-Summen.
						</span>
					</span>
				</label>
				{#if beitragExempt}
					<div class="space-y-1">
						<Label for="m-exempt-reason">Begründung (erforderlich)</Label>
						<Input
							id="m-exempt-reason"
							name="beitrag_exempt_reason"
							data-testid="{mode}-exempt-reason"
							placeholder="z.B. Ehrenmitglied, Härtefall"
							aria-required="true"
							aria-invalid={exemptReasonMissing}
							bind:value={beitragExemptReason}
						/>
						<p class="text-xs text-muted-foreground">Wird im Vereins-Protokoll referenziert.</p>
						{#if exemptReasonMissing}
							<p
								class="text-xs text-severity-warn-text"
								role="alert"
								data-testid="{mode}-exempt-gate"
							>
								Fehlt noch: Begründung (§55 AO).
							</p>
						{/if}
					</div>
				{/if}
			</div>

			{#if errors['_']}
				<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
					{errors['_']?.[0]}
				</p>
			{/if}

			<!-- ── Austritts-Zone (edit only) ─────────────────────────────────── -->
			{#if isEdit}
				<div class="rounded-lg border border-severity-critical/20 bg-severity-critical/5 p-3">
					{#if !confirmAustragen}
						<Button
							type="button"
							variant="ghost"
							class="text-severity-critical-text hover:bg-severity-critical/10"
							onclick={() => (confirmAustragen = true)}
							disabled={loading || deleteLoading}
							data-testid="member-austragen"
						>
							Mitglied austragen…
						</Button>
					{:else}
						<div class="space-y-2">
							<p class="text-sm text-foreground">
								Setzt das Austrittsdatum auf heute — Beitragshistorie und Buchungen bleiben erhalten.
							</p>
							<div class="flex items-center gap-2">
								<Button
									type="submit"
									form="austragen-form"
									variant="destructive"
									disabled={deleteLoading}
									data-testid="member-austragen-confirm"
								>
									{deleteLoading ? 'Wird ausgetragen…' : 'Ja, austragen'}
								</Button>
								<Button
									type="button"
									variant="ghost"
									onclick={() => (confirmAustragen = false)}
									disabled={deleteLoading}
								>
									Abbrechen
								</Button>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button variant="outline" type="button" {...props} disabled={loading}>Abbrechen</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" disabled={loading || deleteLoading || exemptReasonMissing} data-testid="member-submit">
					{#if loading}
						<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
						</svg>
					{/if}
					{isEdit ? 'Speichern' : 'Mitglied anlegen'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

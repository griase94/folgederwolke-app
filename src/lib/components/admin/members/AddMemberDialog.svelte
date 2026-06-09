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

	// Night-2 C5-MEM-full — exempt toggle drives the optional reason field.
	let beitragExempt = $state(false);
	// Task 2.11 — §55 AO Grund required when exemption is on (client mirror).
	let beitragExemptReason = $state('');

	const todayIso = new Date().toISOString().slice(0, 10);

	function reset() {
		errors = {};
		loading = false;
		beitragExempt = false;
		beitragExemptReason = '';
	}

	const exemptReasonMissing = $derived(
		beitragExempt && beitragExemptReason.trim().length === 0
	);

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
			action="?/add"
			use:enhance={() => {
				loading = true;
				errors = {};
				return async ({ result, update }) => {
					loading = false;
					if (result.type === 'failure') {
						errors = (result.data?.errors as Record<string, string[]>) ?? {};
					} else if (result.type === 'error') {
						// An uncaught server error (500) → SvelteKit would otherwise swap
						// to the error page and discard the typed-in values. Keep the
						// dialog open with a generic message (mirrors the delete path's
						// error handling) and do NOT call update().
						errors = {
							_: ['Mitglied konnte nicht angelegt werden. Bitte erneut versuchen.'],
						};
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

			<div class="space-y-1">
				<Label for="add-role">Rolle</Label>
				<select
					id="add-role"
					name="role"
					data-testid="add-role-select"
					class="border-input bg-background h-8 w-full rounded-lg border px-2.5 py-1 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
				>
					<option value="mitglied">Mitglied</option>
					<option value="vorstand">Vorstand</option>
					<option value="kassenwart">Kassenwart</option>
					<option value="schriftfuehrer">Schriftführer</option>
					<option value="fördermitglied">Fördermitglied</option>
					<!-- Night-2 C5-MEM-full: extern + helfer additions -->
					<option value="extern">Extern</option>
					<option value="helfer">Helfer</option>
				</select>
			</div>

			<!-- Night-2 C5-MEM-full — Beitragspflicht aussetzen (optional) -->
			<div class="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
				<label class="flex items-start gap-2 text-sm">
					<input
						id="add-beitrag-exempt"
						type="checkbox"
						name="beitrag_exempt"
						data-testid="add-beitrag-exempt"
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
						<Label for="add-exempt-reason">Begründung (erforderlich)</Label>
						<Input
							id="add-exempt-reason"
							name="beitrag_exempt_reason"
							placeholder="z.B. Ehrenmitglied, Härtefall"
							aria-required="true"
							aria-invalid={exemptReasonMissing}
							bind:value={beitragExemptReason}
						/>
						{#if exemptReasonMissing}
							<p class="text-xs text-destructive" role="alert">
								Grund erforderlich (§55 AO).
							</p>
						{/if}
					</div>
				{/if}
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
				<Button type="submit" disabled={loading || exemptReasonMissing}>
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
					Mitglied anlegen
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

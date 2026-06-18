<script lang="ts">
	/**
	 * ManualImportSheet — Package C4. Aurora multipart redesign.
	 *
	 * Changes from pre-C4:
	 * - Multipart POST: drop JSON `data` field + buildPayload(). Form fields are
	 *   submitted directly (bezahlt_von_kind, bezeichnung, betragCents, rechnungsdatum,
	 *   beleg, keinBeleg, begruendung, kommentar, member_id, extern_name/iban/email).
	 * - Required BelegUpload section (position 5, before Kommentar).
	 * - Drive note removed.
	 * - Native date input → DateField (hidden ISO rechnungsdatum).
	 * - validate() extended for Beleg arms.
	 * - Beleg state cleared in reset $effect.
	 * - New field order: Wer hat bezahlt? → Was war's? → Betrag → Rechnungsdatum
	 *   → Beleg (required) → Kommentar.
	 * - Footer pinned with type-ausgabe accent strip.
	 */
	import { enhance } from '$app/forms';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { toast } from 'svelte-sonner';
	import { parseBetragCents } from '$lib/client/parse-betrag.js';
	import { handleIbanInput, normalizeIban } from '$lib/client/iban.js';
	import { DateField } from '$lib/components/ui/date-field/index.js';
	import BelegUpload from '$lib/components/admin/transactions/fields/BelegUpload.svelte';

	interface Member {
		id: string;
		display_name: string;
		email?: string;
	}

	let {
		open = $bindable(false),
		vereinName = 'Verein',
		members = [],
		onSuccess
	}: {
		open: boolean;
		/** Runtime Verein name (from $page.data.vereinName) — label + persisted display. */
		vereinName?: string;
		members?: Member[];
		onSuccess?: (ausId: string) => void;
	} = $props();

	// ── Form state ────────────────────────────────────────────────────────────
	let bezahltVonKind = $state<'verein' | 'member' | 'extern'>('verein');
	let memberId = $state('');
	let memberDisplayName = $state('');
	let memberEmail = $state('');
	let externName = $state('');
	let externIban = $state('');
	let externEmail = $state('');
	let ibanDisplay = $state('');

	let bezeichnung = $state('');
	let betrag = $state('');
	let rechnungsdatum = $state(new Date().toISOString().split('T')[0]!);
	let kommentar = $state('');

	// Beleg state (C4 — reset on close)
	let keinBeleg = $state(false);
	let begruendung = $state('');

	let loading = $state(false);
	let fieldErrors = $state<Record<string, string>>({});

	// ── Reset on close ────────────────────────────────────────────────────────
	$effect(() => {
		if (!open) {
			bezahltVonKind = 'verein';
			memberId = '';
			memberDisplayName = '';
			memberEmail = '';
			externName = '';
			externIban = '';
			externEmail = '';
			ibanDisplay = '';
			bezeichnung = '';
			betrag = '';
			rechnungsdatum = new Date().toISOString().split('T')[0]!;
			kommentar = '';
			// C4: clear beleg state on close
			keinBeleg = false;
			begruendung = '';
			loading = false;
			fieldErrors = {};
		}
	});

	// ── Validation (C4: extended for Beleg arms) ──────────────────────────────
	function validate(formEl: HTMLFormElement): boolean {
		const errs: Record<string, string> = {};
		if (bezahltVonKind === 'member' && !memberId) {
			errs['member'] = 'Bitte ein Vereinsmitglied auswählen.';
		}
		if (bezahltVonKind === 'extern') {
			if (!externName.trim()) errs['extern_name'] = 'Name ist erforderlich.';
			if (!externIban.trim()) errs['extern_iban'] = 'IBAN ist erforderlich.';
			if (!externEmail.trim()) errs['extern_email'] = 'E-Mail ist erforderlich.';
		}
		if (!bezeichnung.trim() || bezeichnung.trim().length < 3) {
			errs['bezeichnung'] = 'Bitte mindestens 3 Zeichen eingeben.';
		}
		const cents = parseBetragCents(betrag);
		if (!cents || cents <= 0) {
			errs['betrag'] = 'Bitte einen gültigen Betrag eingeben (z.B. 12,50).';
		}
		// Beleg gate (C4): ARM A (file) XOR ARM B (keinBeleg + Begründung ≥5 chars)
		const belegInput = formEl.querySelector<HTMLInputElement>('input[name="beleg"]');
		const hasBelegFile = !!(belegInput?.files && belegInput.files.length > 0 && belegInput.files[0]!.size > 0);
		if (!hasBelegFile) {
			if (!keinBeleg) {
				errs['beleg'] = 'Bitte einen Beleg hochladen oder "Kein Beleg vorhanden" wählen.';
			} else if (begruendung.trim().length < 5) {
				errs['beleg'] = 'Bitte eine Begründung eingeben (mindestens 5 Zeichen).';
			}
		}
		fieldErrors = errs;
		return Object.keys(errs).length === 0;
	}

	// ── IBAN helpers ──────────────────────────────────────────────────────────
	function onIbanInput(e: Event & { currentTarget: HTMLInputElement }) {
		handleIbanInput(e);
		externIban = normalizeIban(e.currentTarget.value);
		ibanDisplay = e.currentTarget.value;
	}

	// ── Member select ─────────────────────────────────────────────────────────
	function onMemberSelect(e: Event & { currentTarget: HTMLSelectElement }) {
		const selected = members.find((m) => m.id === e.currentTarget.value);
		memberId = selected?.id ?? '';
		memberDisplayName = selected?.display_name ?? '';
		memberEmail = selected?.email ?? '';
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="flex w-full flex-col overflow-hidden sm:max-w-lg">
		<!-- type-ausgabe accent strip (C4) -->
		<div class="h-1 w-full shrink-0 rounded-t-2xl bg-type-ausgabe" aria-hidden="true"></div>

		<Sheet.Header class="shrink-0 pb-0 pt-4">
			<Sheet.Title class="text-lg font-bold">Manuell hinzufügen</Sheet.Title>
			<Sheet.Description>
				Auslage auf Papierbeleg- oder Telefonbasis im Namen einer Person eintragen.
			</Sheet.Description>
		</Sheet.Header>

		<form
			method="POST"
			action="?/manual-import"
			enctype="multipart/form-data"
			class="flex min-h-0 flex-1 flex-col"
			use:enhance={({ formElement: formEl }) => {
				if (!validate(formEl)) return { cancel: true } as never;
				loading = true;
				// No JSON `data` field injection — fields posted as multipart directly.

				return async ({ result, update }) => {
					loading = false;
					if (result.type === 'success') {
						const data = result.data as { ausId?: string } | undefined;
						const id = data?.ausId ?? '—';
						toast.success(`Einreichung ${id} gespeichert`);
						open = false;
						onSuccess?.(id);
						await update();
					} else if (result.type === 'failure') {
						const data = result.data as { error?: string; errors?: Record<string, string[]> } | undefined;
						if (data?.errors) {
							// Flatten server field errors into local fieldErrors
							const flat: Record<string, string> = {};
							for (const [k, msgs] of Object.entries(data.errors)) {
								flat[k] = msgs[0] ?? '';
							}
							fieldErrors = flat;
						}
						toast.error(data?.error ?? 'Fehler beim Speichern');
						await update({ reset: false });
					} else {
						await update();
					}
				};
			}}
		>
			<!-- Scrollable body -->
			<div class="flex-1 space-y-6 overflow-y-auto px-1 py-6">

				<!-- Hidden fields for member display name + email (for the server's bezahlt_von) -->
				<input type="hidden" name="bezahlt_von_display" value={bezahltVonKind === 'verein' ? vereinName : bezahltVonKind === 'member' ? memberDisplayName : externName} />
				{#if bezahltVonKind === 'member'}
					<input type="hidden" name="member_email" value={memberEmail} />
				{/if}

				<!-- ── 1. Wer hat bezahlt? ──────────────────────────────────────────── -->
				<fieldset class="space-y-2">
					<legend class="text-sm font-medium text-foreground">Wer hat bezahlt?</legend>
					{#each [
						{ value: 'verein', label: vereinName },
						{ value: 'member', label: 'Vereinsmitglied' },
						{ value: 'extern', label: 'Externe Person' }
					] as opt (opt.value)}
						<label
							class="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
						>
							<input
								type="radio"
								name="bezahlt_von_kind"
								value={opt.value}
								checked={bezahltVonKind === opt.value}
								onchange={() => {
									bezahltVonKind = opt.value as 'verein' | 'member' | 'extern';
									fieldErrors = {};
								}}
								class="accent-primary h-4 w-4"
							/>
							<span class="text-sm font-medium">{opt.label}</span>
						</label>
					{/each}
				</fieldset>

				<!-- Member picker -->
				{#if bezahltVonKind === 'member'}
					<div class="space-y-1.5">
						<Label for="mi-member-select">Vereinsmitglied</Label>
						<select
							id="mi-member-select"
							name="member_id"
							class="border-input bg-background focus-visible:ring-ring h-10 w-full rounded-md border px-3 py-2 text-base focus-visible:ring-2 focus-visible:outline-none md:text-sm"
							onchange={onMemberSelect}
						>
							<option value="">— Mitglied wählen —</option>
							{#each members as m (m.id)}
								<option value={m.id} selected={m.id === memberId}>{m.display_name}</option>
							{/each}
						</select>
						{#if fieldErrors['member']}
							<p class="text-destructive text-xs">{fieldErrors['member']}</p>
						{/if}
					</div>
				{/if}

				<!-- Extern fields -->
				{#if bezahltVonKind === 'extern'}
					<div class="space-y-4">
						<div class="space-y-1.5">
							<Label for="mi-extern-name">Name <span aria-hidden="true">*</span></Label>
							<Input
								id="mi-extern-name"
								name="extern_name"
								type="text"
								placeholder="Max Mustermann"
								bind:value={externName}
							/>
							{#if fieldErrors['extern_name']}
								<p class="text-destructive text-xs">{fieldErrors['extern_name']}</p>
							{/if}
						</div>
						<div class="space-y-1.5">
							<Label for="mi-extern-iban">IBAN <span aria-hidden="true">*</span></Label>
							<Input
								id="mi-extern-iban"
								name="extern_iban"
								type="text"
								placeholder="DE89 3704 0044 0532 0130 00"
								value={ibanDisplay}
								oninput={onIbanInput}
							/>
							{#if fieldErrors['extern_iban']}
								<p class="text-destructive text-xs">{fieldErrors['extern_iban']}</p>
							{/if}
						</div>
						<div class="space-y-1.5">
							<Label for="mi-extern-email">E-Mail <span aria-hidden="true">*</span></Label>
							<Input
								id="mi-extern-email"
								name="extern_email"
								type="email"
								placeholder="max@example.com"
								bind:value={externEmail}
							/>
							{#if fieldErrors['extern_email']}
								<p class="text-destructive text-xs">{fieldErrors['extern_email']}</p>
							{/if}
						</div>
					</div>
				{/if}

				<!-- ── 2. Was war's? (Bezeichnung) ──────────────────────────────────── -->
				<div class="space-y-1.5">
					<Label for="mi-bezeichnung">Was war's? <span aria-hidden="true">*</span></Label>
					<Input
						id="mi-bezeichnung"
						name="bezeichnung"
						type="text"
						maxlength={200}
						placeholder="Bahnticket München → Berlin"
						bind:value={bezeichnung}
						aria-required="true"
						aria-invalid={!!fieldErrors['bezeichnung']}
					/>
					{#if fieldErrors['bezeichnung']}
						<p class="text-destructive text-xs">{fieldErrors['bezeichnung']}</p>
					{/if}
				</div>

				<!-- ── 3. Betrag ─────────────────────────────────────────────────────── -->
				<div class="space-y-1.5">
					<Label for="mi-betrag">Betrag in Euro <span aria-hidden="true">*</span></Label>
					<div class="relative">
						<span
							class="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 select-none text-sm"
							aria-hidden="true">€</span
						>
						<Input
							id="mi-betrag"
							type="text"
							inputmode="decimal"
							placeholder="12,50"
							class="pl-7"
							bind:value={betrag}
							aria-required="true"
							aria-invalid={!!fieldErrors['betrag']}
						/>
						<!-- Hidden betragCents for the server Zod schema -->
						<input type="hidden" name="betragCents" value={parseBetragCents(betrag) ?? 0} />
					</div>
					{#if fieldErrors['betrag']}
						<p class="text-destructive text-xs">{fieldErrors['betrag']}</p>
					{/if}
				</div>

				<!-- ── 4. Rechnungsdatum (DateField, C4) ─────────────────────────────── -->
				<div class="space-y-1.5">
					<Label for="mi-datum">Rechnungsdatum</Label>
					<DateField
						id="mi-datum"
						name="rechnungsdatum"
						value={rechnungsdatum}
						onchange={(iso) => { rechnungsdatum = iso; }}
					/>
				</div>

				<!-- ── 5. Beleg (required — C4) ─────────────────────────────────────── -->
				<div class="space-y-1.5">
					<BelegUpload
						bind:keinBeleg
						bind:begruendung
						error={fieldErrors['beleg']}
					/>
				</div>

				<!-- ── 6. Kommentar ──────────────────────────────────────────────────── -->
				<div class="space-y-1.5">
					<Label for="mi-kommentar"
						>Kommentar <span class="text-muted-foreground font-normal">(optional)</span></Label
					>
					<textarea
						id="mi-kommentar"
						name="kommentar"
						rows={3}
						maxlength={1000}
						placeholder="z.B. Papierkasse Sommerfest"
						class="border-input bg-background focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-base focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
						bind:value={kommentar}
					></textarea>
				</div>
			</div>

			<!-- ── Pinned footer (C4) ─────────────────────────────────────────────── -->
			<Sheet.Footer class="shrink-0 flex-col gap-2 border-t border-hairline bg-background px-4 py-3">
				<Button type="submit" disabled={loading} class="w-full">
					{#if loading}
						<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
							></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							></path>
						</svg>
						Wird gespeichert…
					{:else}
						Einreichung speichern
					{/if}
				</Button>
				<Sheet.Close>
					{#snippet child({ props })}
						<Button variant="outline" type="button" class="w-full" {...props} disabled={loading}>
							Abbrechen
						</Button>
					{/snippet}
				</Sheet.Close>
			</Sheet.Footer>
		</form>
	</Sheet.Content>
</Sheet.Root>

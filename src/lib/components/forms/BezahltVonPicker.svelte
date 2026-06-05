<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { formatIban, handleIbanInput, normalizeIban } from '$lib/client/iban.js';

	interface Member {
		id: string;
		display_name: string;
		email?: string;
	}

	interface Props {
		kind: 'verein' | 'member' | 'extern';
		/** Runtime Verein name (from $page.data.vereinName) used as the 'verein' label. */
		vereinName?: string;
		members?: Member[];
		memberId?: string;
		memberDisplayName?: string;
		memberEmail?: string;
		externName?: string;
		externIban?: string;
		externEmail?: string;
		errors?: Record<string, string[]>;
		onchange?: () => void;
	}

	let {
		kind = $bindable('verein'),
		vereinName = 'Verein',
		members = [],
		memberId = $bindable(''),
		memberDisplayName = $bindable(''),
		memberEmail = $bindable(''),
		externName = $bindable(''),
		externIban = $bindable(''),
		externEmail = $bindable(''),
		errors = {},
		onchange
	}: Props = $props();

	// Track which fields have been blurred (for real-time validation)
	let blurred: Record<string, boolean> = $state({});

	function markBlurred(field: string) {
		blurred[field] = true;
	}

	function getError(field: string): string | undefined {
		return blurred[field] ? errors[field]?.[0] : undefined;
	}

	// Formatted IBAN display value
	let ibanDisplay = $state(externIban ? formatIban(externIban) : '');

	function onIbanInput(e: Event & { currentTarget: HTMLInputElement }) {
		handleIbanInput(e);
		externIban = normalizeIban(e.currentTarget.value);
		onchange?.();
	}

	function onMemberSelect(e: Event & { currentTarget: HTMLSelectElement }) {
		const selected = members.find((m) => m.id === e.currentTarget.value);
		memberId = selected?.id ?? '';
		memberDisplayName = selected?.display_name ?? '';
		memberEmail = selected?.email ?? '';
		onchange?.();
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>Wer hat bezahlt?</CardTitle>
	</CardHeader>
	<CardContent class="flex flex-col gap-4">
		<!-- Radio group: verein / member / extern -->
		<fieldset class="flex flex-col gap-2">
			<legend class="sr-only">Wer hat bezahlt?</legend>

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
						checked={kind === opt.value}
						onchange={() => {
							kind = opt.value as 'verein' | 'member' | 'extern';
							onchange?.();
						}}
						class="accent-primary h-4 w-4"
					/>
					<span class="text-sm font-medium">{opt.label}</span>
				</label>
			{/each}
		</fieldset>

		<!-- Member: searchable select -->
		{#if kind === 'member'}
			<div class="flex flex-col gap-1.5">
				<Label for="member-select">Vereinsmitglied auswählen</Label>
				{#if members.length === 0}
					<p class="text-muted-foreground text-sm italic">
						Mitgliederliste wird in einer späteren Version geladen.
					</p>
					<!-- Hidden fields so the form still submits if JS fills them -->
					<input type="hidden" name="member_id" value={memberId} />
					<input type="hidden" name="member_display_name" value={memberDisplayName} />
					<input type="hidden" name="member_email" value={memberEmail} />
				{:else}
					<select
						id="member-select"
						class="border-input bg-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-base md:text-sm focus-visible:ring-2 focus-visible:outline-none"
						onchange={onMemberSelect}
						onblur={() => markBlurred('member_id')}
						aria-describedby={getError('bezahlt_von.member_id') ? 'err-member_id' : undefined}
					>
						<option value="">— Mitglied wählen —</option>
						{#each members as m (m.id)}
							<option value={m.id} selected={m.id === memberId}>{m.display_name}</option>
						{/each}
					</select>
					<input type="hidden" name="member_id" value={memberId} />
					<input type="hidden" name="member_display_name" value={memberDisplayName} />
					<input type="hidden" name="member_email" value={memberEmail} />
				{/if}
				{#if getError('bezahlt_von.member_id')}
					<p id="err-member_id" class="text-destructive text-xs">{getError('bezahlt_von.member_id')}</p>
				{/if}
			</div>
		{/if}

		<!-- Extern fields -->
		{#if kind === 'extern'}
			<div class="flex flex-col gap-4">
				<div class="flex flex-col gap-1.5">
					<Label for="extern-name">Name <span aria-hidden="true">*</span></Label>
					<p class="text-muted-foreground text-xs">Vor- und Nachname so wie auf dem Bankkonto.</p>
					<Input
						id="extern-name"
						name="extern_name"
						type="text"
						autocomplete="name"
						placeholder="Max Mustermann"
						bind:value={externName}
						oninput={onchange}
						onblur={() => markBlurred('bezahlt_von.name')}
						aria-invalid={!!getError('bezahlt_von.name')}
						aria-describedby={getError('bezahlt_von.name') ? 'err-extern-name' : undefined}
					/>
					{#if getError('bezahlt_von.name')}
						<p id="err-extern-name" class="text-destructive text-xs">{getError('bezahlt_von.name')}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="extern-iban">IBAN <span aria-hidden="true">*</span></Label>
					<p class="text-muted-foreground text-xs">Mit oder ohne Leerzeichen, beides geht.</p>
					<Input
						id="extern-iban"
						name="extern_iban_display"
						type="text"
						inputmode="text"
						autocomplete="off"
						placeholder="DE89 3704 0044 0532 0130 00"
						value={ibanDisplay}
						oninput={onIbanInput}
						onblur={() => markBlurred('bezahlt_von.iban')}
						aria-invalid={!!getError('bezahlt_von.iban')}
						aria-describedby={getError('bezahlt_von.iban') ? 'err-extern-iban' : undefined}
					/>
					<!-- Normalized (no spaces) for server -->
					<input type="hidden" name="extern_iban" value={externIban} />
					{#if getError('bezahlt_von.iban')}
						<p id="err-extern-iban" class="text-destructive text-xs">{getError('bezahlt_von.iban')}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5">
					<Label for="extern-email">E-Mail <span aria-hidden="true">*</span></Label>
					<p class="text-muted-foreground text-xs">
						Hierhin schicken wir die Eingangsbestätigung und später die Erstattungs-Mail.
					</p>
					<Input
						id="extern-email"
						name="extern_email"
						type="email"
						autocomplete="email"
						inputmode="email"
						placeholder="max@example.com"
						bind:value={externEmail}
						oninput={onchange}
						onblur={() => markBlurred('bezahlt_von.email')}
						aria-invalid={!!getError('bezahlt_von.email')}
						aria-describedby={getError('bezahlt_von.email') ? 'err-extern-email' : undefined}
					/>
					{#if getError('bezahlt_von.email')}
						<p id="err-extern-email" class="text-destructive text-xs">{getError('bezahlt_von.email')}</p>
					{/if}
				</div>
			</div>
		{/if}
	</CardContent>
</Card>

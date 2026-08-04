<!--
	WelcomeCard — the ONE friendly ask for a member's IBAN
	(Aurora A-flow S2b, brief portal-onboarding-iban).

	"Deine IBAN wohnt in deinem Profil. Wir fragen genau dann, wenn sie fehlt und
	gebraucht wird — plus einmal freundlich zur Begrüßung. Sonst nie."

	Deliberately NOT a gate and NOT a nag: no wizard, no blocked home, no amber.
	Amber belongs to the Auslagen form, where a missing IBAN actually blocks
	something. Here it is an invitation, and "Später" is a first-class answer.

	W1 (no IBAN on file)  → "Magst du gleich deine IBAN dalassen?"
	W2 (IBAN on file)     → "Passt dein Konto noch?" (derive-don't-ask)

	Any resolution — save / confirm / skip / replace — stamps
	`users.welcome_seen_at`, and the card is gone for good, on every device.
	Leaving without answering is NOT a rejection: it comes back next visit.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import { enhance } from '$app/forms';
	import { FIELD_CLASS } from '$lib/components/ui/field-class/index.js';
	import { handleIbanInput } from '$lib/client/iban.js';
	import { validateIban } from '$lib/domain/iban.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { IBAN_ERROR } from './PayoutBlock.svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';

	export interface WelcomeCardProps {
		vorname: string;
		/** The stored IBAN, ALREADY MASKED. null → W1, otherwise W2. */
		maskedIban: string | null;
		/** Action that saves an IBAN + stamps welcome_seen_at. */
		saveAction?: string;
		/** Action that only stamps welcome_seen_at (skip / confirm). */
		dismissAction?: string;
		/** Server error from the last save attempt. */
		error?: string | null;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		vorname,
		maskedIban,
		saveAction = '?/welcomeIban',
		dismissAction = '?/welcomeDismiss',
		error = null,
		class: className,
		'data-testid': testId = 'welcome-card'
	}: WelcomeCardProps = $props();

	/** W2 only: the member said the stored account is wrong and types a new one. */
	let replacing = $state(false);
	let iban = $state('');
	let saving = $state(false);
	let clientError = $state<string | null>(null);
	let inputEl: HTMLInputElement | undefined = $state();

	const variant = $derived(maskedIban ? 'confirm' : 'ask');
	// W1 asks straight away; W2 only after "Stimmt nicht mehr".
	const showInput = $derived(variant === 'ask' || replacing);
	const valid = $derived(validateIban(iban));

	function startReplace() {
		replacing = true;
		iban = '';
		clientError = null;
		queueMicrotask(() => inputEl?.focus());
	}
</script>

<section
	class={cn(
		'rounded-2xl border border-hairline bg-card p-4 sm:p-5',
		'[background-image:var(--gradient-brand-soft)]',
		className
	)}
	data-testid={testId}
	data-slot="welcome-card"
	data-variant={variant}
	aria-labelledby="welcome-card-title"
>
	<div class="flex items-start gap-3">
		<span
			class="grid size-9 shrink-0 place-items-center rounded-xl bg-card/70 text-primary-text"
			aria-hidden="true"
		>
			<Sparkles class="size-5" />
		</span>
		<div class="min-w-0 flex-1">
			<h2 id="welcome-card-title" class="text-base font-semibold text-ink-900">
				{#if variant === 'ask'}
					Magst du gleich deine IBAN dalassen, {vorname}?
				{:else}
					Passt dein Konto noch, {vorname}?
				{/if}
			</h2>

			{#if variant === 'confirm' && !replacing}
				<p class="mt-1 text-sm text-ink-700">
					Erstattungen gehen an
					<b class="font-mono font-semibold whitespace-nowrap text-ink-900" data-testid="welcome-masked-iban"
						>{maskedIban}</b
					>.
				</p>
			{/if}

			<form
				method="post"
				action={showInput ? saveAction : dismissAction}
				use:enhance={({ cancel, submitter }) => {
					// Only the SAVE button carries an IBAN. "Später" and "Passt so"
					// must sail past validation — they are answers, not omissions.
					const carriesIban = (submitter as HTMLElement | null)?.dataset.ibanSubmit === 'true';
					if (carriesIban && !valid) {
						// The primary is never disabled (DESIGN-GUIDELINES §4) — it
						// explains itself instead: error + focus on the gap.
						clientError = IBAN_ERROR;
						inputEl?.focus();
						cancel();
						return;
					}
					saving = true;
					return async ({ update }) => {
						saving = false;
						await update({ reset: false });
					};
				}}
				class="mt-3 flex flex-col gap-3"
			>
				{#if showInput}
					<div class="flex flex-col gap-1.5">
						<label for="welcome-iban" class="sr-only">IBAN</label>
						<input
							bind:this={inputEl}
							id="welcome-iban"
							name="iban"
							type="text"
							autocomplete="off"
							spellcheck="false"
							maxlength={42}
							placeholder="DE00 0000 0000 0000 0000 00"
							bind:value={iban}
							oninput={handleIbanInput}
							disabled={saving}
							aria-invalid={clientError || error ? 'true' : undefined}
							aria-describedby="welcome-iban-hint"
							data-testid="welcome-iban-input"
							class={cn(
								FIELD_CLASS,
								'max-w-[34ch] bg-card font-mono tracking-[0.04em]',
								(clientError || error) &&
									'border-severity-critical ring-2 ring-[color-mix(in_srgb,var(--sev-critical)_16%,transparent)]'
							)}
						/>
						{#if clientError || error}
							<p
								id="welcome-iban-hint"
								class="text-xs text-severity-critical-text"
								role="alert"
								data-testid="welcome-iban-error"
							>
								{clientError ?? error}
							</p>
						{:else}
							<p
								id="welcome-iban-hint"
								class="flex items-start gap-1.5 text-xs text-ink-500"
							>
								<ShieldCheck class="mt-0.5 size-3.5 shrink-0 text-type-einnahme" aria-hidden="true" />
								Für die Rücküberweisung — geht verschlüsselt direkt an den Vorstand.
							</p>
						{/if}
					</div>
				{/if}

				<div class="flex flex-wrap items-center gap-2">
					{#if showInput}
						<Button
							type="submit"
							size="cta"
							loading={saving}
							data-iban-submit="true"
							data-testid="welcome-save"
						>
							IBAN speichern
						</Button>
					{:else}
						<Button type="submit" size="cta" loading={saving} data-testid="welcome-confirm">
							Passt so
						</Button>
					{/if}

					{#if variant === 'ask'}
						<!-- "Später" is a real answer, not a dismissal to feel bad about. -->
						<Button
							type="submit"
							variant="ghost"
							size="cta"
							formaction={dismissAction}
							disabled={saving}
							data-testid="welcome-skip"
						>
							Später
						</Button>
					{:else if !replacing}
						<Button
							type="button"
							variant="ghost"
							size="cta"
							onclick={startReplace}
							data-testid="welcome-replace"
						>
							Stimmt nicht mehr — neue eintragen
						</Button>
					{/if}
				</div>
			</form>
		</div>
	</div>
</section>

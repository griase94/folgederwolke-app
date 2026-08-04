<!--
	PayoutBlock — the IBAN decision matrix of the member Auslagen form
	(Aurora A-flow S2b, plate `.payout`, brief portal-onboarding-iban §1a).
	The copy in all three cases is ratified verbatim.

	Fall A · a profile IBAN exists    → confirmed account row (masked) + a quiet
	                                    toggle. NOTHING to type.
	Fall B · no profile IBAN          → the IBAN field lives IN THE FORM, with
	                                    "save to my profile" pre-checked. No
	                                    gate, no detour via the Profil page.
	Fall C · profile IBAN, toggle open → a one-off IBAN for THIS submission;
	                                    updating the profile stays a deliberate
	                                    second choice (never the default).

	Privacy: the stored IBAN only ever appears masked. Changing it means typing a
	new one (replace semantics) — the old value is never editable in place, and
	the full IBAN never leaves the server.

	The parent owns validity: it derives it from the same `validateIban` this
	component uses, so form gate and field can never disagree.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import { FIELD_CLASS } from '$lib/components/admin/transactions/fields/field-class.js';
	import { handleIbanInput } from '$lib/client/iban.js';
	import { maskIbanDisplay, validateIban } from '$lib/domain/iban.js';
	import Wallet from '@lucide/svelte/icons/wallet';
	import Landmark from '@lucide/svelte/icons/landmark';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Info from '@lucide/svelte/icons/info';

	export type PayoutMode = 'confirmed' | 'entry' | 'override';

	export interface PayoutBlockProps {
		/** The member's stored IBAN, ALREADY MASKED by the server. null = Fall B. */
		maskedIban: string | null;
		/** Bound: the typed IBAN (Fall B/C). Empty in Fall A. */
		iban?: string;
		/** Bound: write the typed IBAN to the profile as well. */
		saveToProfile?: boolean;
		/** Bound: Fall C — the "other IBAN" toggle is open. */
		override?: boolean;
		/** Server-side field error (422). Client validation runs live regardless. */
		error?: string;
		/** Form field names. */
		name?: string;
		saveName?: string;
		class?: string;
		'data-testid'?: string;
	}

	/** The ratified error copy — one wording for every invalid-IBAN case. */
	export const IBAN_ERROR = 'Das ist keine gültige IBAN — prüf Ländercode und Länge.';

	/**
	 * Which case are we in? Derived from the data, never passed in — so the
	 * caller cannot render Fall A without an IBAN to confirm.
	 */
	export function payoutMode(maskedIban: string | null, override: boolean): PayoutMode {
		if (!maskedIban) return 'entry';
		return override ? 'override' : 'confirmed';
	}
</script>

<script lang="ts">
	let {
		maskedIban,
		iban = $bindable(''),
		// The default follows the case, not the component: Fall B (nothing on
		// file) pre-checks "save it", while Fall C must never pre-select
		// overwriting an account the member already trusts.
		saveToProfile = $bindable(!maskedIban),
		override = $bindable(false),
		error,
		name = 'erstattung_iban',
		saveName = 'erstattung_iban_save',
		class: className,
		'data-testid': testId = 'payout-block'
	}: PayoutBlockProps = $props();

	const mode = $derived(payoutMode(maskedIban, override));
	const touched = $derived(iban.trim().length > 0);
	const ibanValid = $derived(validateIban(iban));
	// A half-typed IBAN is "not done yet", not "wrong" — only scold once the
	// input is long enough to plausibly be complete.
	const showFormatError = $derived(touched && iban.replace(/[\s-]/g, '').length >= 15 && !ibanValid);
	const hintId = $derived(`${name}-hint`);

	let inputEl: HTMLInputElement | undefined = $state();

	/**
	 * Fall C clarity line: only meaningful while the stored account is being
	 * KEPT — once "auch im Profil aktualisieren" is chosen, it would be a lie.
	 */
	const typedMasked = $derived(ibanValid && !saveToProfile ? maskIbanDisplay(iban) : null);

	const scopeOptions = [
		{
			value: false,
			title: 'Nur für diese Einreichung',
			sub: 'Dein hinterlegtes Konto bleibt unverändert.',
			testId: 'payout-scope-once'
		},
		{
			value: true,
			title: 'Auch in meinem Profil aktualisieren',
			sub: 'Ersetzt deine hinterlegte IBAN dauerhaft.',
			testId: 'payout-scope-profile'
		}
	];

	function openOverride() {
		override = true;
		// The field starts EMPTY — replace semantics, never edit the stored value.
		iban = '';
		saveToProfile = false;
		queueMicrotask(() => inputEl?.focus());
	}

	function closeOverride() {
		override = false;
		iban = '';
		saveToProfile = false;
	}
</script>

<div
	class={cn('rounded-[16px] border border-hairline bg-secondary px-4 pb-4', className)}
	data-testid={testId}
	data-slot="payout-block"
	data-mode={mode}
>
	<!-- head -->
	<div class="flex items-center gap-2 border-b border-hairline py-3">
		<span class="flex items-center gap-1.5 text-[13px] font-semibold text-ink-700">
			<Wallet class="size-4" aria-hidden="true" />
			Erstattung
		</span>
		{#if mode === 'override'}
			<button
				type="button"
				onclick={closeOverride}
				data-testid="payout-back"
				class="ml-auto inline-flex min-h-11 items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap text-primary-text hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<ArrowLeft class="size-3.5" aria-hidden="true" />
				Zurück zu meinem hinterlegten Konto
			</button>
		{/if}
	</div>

	{#if mode === 'confirmed'}
		<!-- ── Fall A · confirmed account, nothing to type ──────────────────── -->
		<div class="flex items-center gap-3 pt-3.5" data-testid="payout-account">
			<span
				class="grid size-10 shrink-0 place-items-center rounded-xl bg-type-einnahme-tint text-type-einnahme"
				aria-hidden="true"
			>
				<Landmark class="size-5" />
			</span>
			<span class="flex min-w-0 flex-1 flex-col gap-0.5">
				<span class="text-[12.5px] font-medium text-ink-500">Erstattung an dein Konto</span>
				<span
					class="font-mono text-[15px] font-bold whitespace-nowrap text-ink-900"
					data-testid="payout-masked-iban">{maskedIban}</span
				>
			</span>
			<span
				class="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-type-einnahme"
			>
				<Check class="size-4" aria-hidden="true" />
				hinterlegt
			</span>
		</div>

		<button
			type="button"
			onclick={openOverride}
			aria-expanded={false}
			data-testid="payout-toggle"
			class="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-input bg-transparent px-3 text-[12.5px] font-semibold text-ink-700 transition-colors hover:border-border hover:bg-card hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<ChevronDown class="size-4" aria-hidden="true" />
			Andere IBAN für diese Einreichung verwenden
		</button>
	{:else}
		<!-- ── Fall B / C · the IBAN is typed here ──────────────────────────── -->
		<div class="flex flex-col gap-3.5 pt-3.5">
			<div class="flex flex-col gap-1.5">
				<label for={name} class="text-sm font-medium text-ink-900">
					{mode === 'override' ? 'IBAN für diese Einreichung' : 'IBAN fürs Zurücküberweisen'}
					<span class="text-severity-critical" aria-hidden="true">*</span>
				</label>
				<input
					bind:this={inputEl}
					id={name}
					{name}
					type="text"
					inputmode="text"
					autocomplete="off"
					spellcheck="false"
					maxlength={42}
					placeholder="DE00 0000 0000 0000 0000 00"
					bind:value={iban}
					oninput={handleIbanInput}
					aria-invalid={showFormatError || Boolean(error) ? 'true' : undefined}
					aria-describedby={hintId}
					data-testid="payout-iban-input"
					class={cn(
						FIELD_CLASS,
						'max-w-[34ch] font-mono tracking-[0.04em]',
						(showFormatError || error) &&
							'border-severity-critical ring-2 ring-[color-mix(in_srgb,var(--sev-critical)_16%,transparent)]'
					)}
				/>
				{#if showFormatError || error}
					<p
						id={hintId}
						class="text-xs text-severity-critical-text"
						role="alert"
						data-testid="payout-iban-error"
					>
						{error ?? IBAN_ERROR}
					</p>
				{:else if mode === 'entry'}
					<p id={hintId} class="text-xs text-ink-500">
						Für die Rücküberweisung — geht verschlüsselt direkt an den Vorstand.
					</p>
				{/if}
			</div>

			{#if mode === 'entry'}
				<!-- Fall B: pre-checked, so the next Auslage is prefilled. -->
				<label class="flex items-start gap-2 text-sm text-ink-700">
					<input
						type="checkbox"
						name={saveName}
						value="true"
						bind:checked={saveToProfile}
						data-testid="payout-save-to-profile"
						class="mt-0.5 size-4 shrink-0 rounded border-hairline accent-primary"
					/>
					IBAN in meinem Profil speichern — beim nächsten Mal vorausgefüllt.
				</label>
			{:else}
				<!-- Fall C: overwriting the stored account stays a deliberate act. -->
				<div class="flex flex-col gap-2" role="radiogroup" aria-label="Gilt diese IBAN dauerhaft?">
					{#each scopeOptions as opt (opt.testId)}
						<label
							class={cn(
								'grid min-h-[52px] cursor-pointer grid-cols-[20px_1fr] items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
								saveToProfile === opt.value
									? 'border-primary bg-[color-mix(in_srgb,var(--primary)_7%,transparent)]'
									: 'border-hairline bg-card hover:border-input'
							)}
						>
							<input
								type="radio"
								name={saveName}
								value={String(opt.value)}
								checked={saveToProfile === opt.value}
								onchange={() => (saveToProfile = opt.value)}
								data-testid={opt.testId}
								class="size-4 accent-primary"
							/>
							<span class="flex flex-col gap-0.5">
								<span class="text-sm font-semibold text-ink-900">{opt.title}</span>
								<span class="text-xs text-ink-500">{opt.sub}</span>
							</span>
						</label>
					{/each}
				</div>

				{#if typedMasked}
					<p
						class="flex items-start gap-2 rounded-xl border border-[color-mix(in_srgb,var(--primary)_20%,transparent)] bg-[color-mix(in_srgb,var(--primary)_7%,transparent)] px-3 py-2.5 text-xs leading-relaxed text-ink-700"
						aria-live="polite"
						data-testid="payout-clarity"
					>
						<Info class="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />
						<span>
							Diese Erstattung geht an <b class="font-mono font-bold whitespace-nowrap text-ink-900"
								>{typedMasked}</b
							>. Dein hinterlegtes Konto
							<b class="font-mono font-bold whitespace-nowrap text-ink-900">{maskedIban}</b>
							bleibt, wie es ist.
						</span>
					</p>
				{/if}
			{/if}
		</div>
	{/if}
</div>

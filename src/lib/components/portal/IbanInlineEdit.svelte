<!--
	IbanInlineEdit — the permanent care spot for a member's IBAN
	(Aurora A-flow S2b, plate `.li-row.is-edit`, brief §2.2c).

	REPLACE semantics, never edit-in-place: the edit field starts EMPTY and the
	stored value is only ever shown masked. That is a privacy rule, not a style
	choice — the full stored IBAN never leaves the server, so there is nothing
	to put in the field to begin with.

	Posts to a server action and drives its own view → edit → saving → saved
	states through `use:enhance`, so the surrounding page needs no state.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import { enhance } from '$app/forms';
	import { FIELD_CLASS } from '$lib/components/admin/transactions/fields/field-class.js';
	import { handleIbanInput } from '$lib/client/iban.js';
	import { validateIban } from '$lib/domain/iban.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { IBAN_ERROR } from './PayoutBlock.svelte';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Check from '@lucide/svelte/icons/check';

	export interface IbanInlineEditProps {
		/** The stored IBAN, ALREADY MASKED by the server. null = none on file. */
		maskedIban: string | null;
		/** Server action that performs the write, e.g. "?/iban". */
		action: string;
		/** Field label on the ruler. */
		label?: string;
		/** Server error from the last attempt. */
		error?: string | null;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		maskedIban,
		action,
		label = 'IBAN',
		error = null,
		class: className,
		'data-testid': testId = 'iban-inline-edit'
	}: IbanInlineEditProps = $props();

	let editing = $state(false);
	let saving = $state(false);
	let saved = $state(false);
	let value = $state('');
	let clientError = $state<string | null>(null);
	let inputEl: HTMLInputElement | undefined = $state();

	const valid = $derived(validateIban(value));

	function startEdit() {
		editing = true;
		saved = false;
		clientError = null;
		value = '';
		queueMicrotask(() => inputEl?.focus());
	}

	function cancelEdit() {
		editing = false;
		saving = false;
		clientError = null;
		value = '';
	}
</script>

<div
	class={cn('flex flex-col gap-1.5 py-3', className)}
	data-testid={testId}
	data-slot="iban-inline-edit"
>
	{#if !editing}
		<div class="grid grid-cols-[76px_1fr] items-center gap-x-3 gap-y-1">
			<span class="text-[12.5px] font-medium text-ink-500">{label}</span>
			<div class="flex flex-wrap items-center gap-2">
				<span class="font-mono text-sm font-semibold text-ink-900" data-testid="iban-inline-value">
					{maskedIban ?? 'Noch keine hinterlegt'}
				</span>
				{#if saved}
					<span
						class="inline-flex items-center gap-1 text-xs font-semibold text-type-einnahme"
						role="status"
						data-testid="iban-inline-saved"
					>
						<Check class="size-3.5" aria-hidden="true" />
						gespeichert
					</span>
				{/if}
				<button
					type="button"
					onclick={startEdit}
					data-testid="iban-inline-edit-start"
					class="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-border bg-card px-2.5 text-[12.5px] font-semibold text-ink-700 transition-colors hover:border-input hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<Pencil class="size-3.5" aria-hidden="true" />
					{maskedIban ? 'Ändern' : 'Eintragen'}
				</button>
			</div>
		</div>
	{:else}
		<form
			method="post"
			{action}
			use:enhance={({ cancel }) => {
				if (!valid) {
					// The primary is never disabled (DESIGN-GUIDELINES §4) — it
					// explains itself instead: error + focus on the gap.
					clientError = IBAN_ERROR;
					inputEl?.focus();
					cancel();
					return;
				}
				saving = true;
				return async ({ update, result }) => {
					saving = false;
					if (result.type === 'success') {
						editing = false;
						saved = true;
						value = '';
					}
					await update({ reset: false });
				};
			}}
			class="grid grid-cols-[76px_1fr] items-center gap-x-3 gap-y-2"
		>
			<label for="iban-inline-input" class="text-[12.5px] font-medium text-ink-500">{label}</label>
			<div class="flex flex-wrap items-center gap-2">
				<input
					bind:this={inputEl}
					id="iban-inline-input"
					name="iban"
					type="text"
					autocomplete="off"
					spellcheck="false"
					maxlength={42}
					placeholder="Neue IBAN — ersetzt die hinterlegte"
					bind:value
					oninput={handleIbanInput}
					disabled={saving}
					aria-invalid={clientError || error ? 'true' : undefined}
					aria-describedby="iban-inline-hint"
					data-testid="iban-inline-input"
					class={cn(
						FIELD_CLASS,
						'max-w-[34ch] min-w-0 flex-1 font-mono tracking-[0.04em]',
						(clientError || error) &&
							'border-severity-critical ring-2 ring-[color-mix(in_srgb,var(--sev-critical)_16%,transparent)]'
					)}
				/>
				<div class="flex shrink-0 gap-2">
					<Button type="submit" size="cta" loading={saving} data-testid="iban-inline-save">
						Speichern
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="cta"
						onclick={cancelEdit}
						disabled={saving}
						data-testid="iban-inline-cancel"
					>
						Abbrechen
					</Button>
				</div>
			</div>
			<p
				id="iban-inline-hint"
				class={cn(
					'col-start-2 text-xs',
					clientError || error ? 'text-severity-critical-text' : 'text-ink-500'
				)}
				role={clientError || error ? 'alert' : undefined}
				data-testid="iban-inline-hint"
			>
				{clientError ?? error ?? 'Die neue IBAN ersetzt die hinterlegte — die alte zeigen wir nie im Klartext.'}
			</p>
		</form>
	{/if}
</div>

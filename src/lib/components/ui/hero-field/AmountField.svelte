<!--
	AmountField — the Betrag hero field (F1 shared primitive).

	Sibling of DateField (identical anatomy — see hero-field-class.ts). A German
	amount input: right-aligned 24/800 tabular value in the transaction-type
	accent, optional −/+ sign glyph, € suffix. Emits integer cents (ADR-0003)
	through a hidden input (`name`) so route actions/Zod keep parsing cents;
	parsing uses the shared parseBetragCents (rejects negatives, handles de/en).
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import { parseBetragCents } from '$lib/client/parse-betrag.js';
	import {
		HERO_WRAP,
		HERO_WRAP_ERROR,
		HERO_PREFIX,
		HERO_INPUT
	} from './hero-field-class.js';

	export type AmountType = 'ausgabe' | 'einnahme' | 'spende';
	export type AmountSign = 'minus' | 'plus' | 'none';

	export interface AmountFieldProps {
		/** Name of the hidden integer-cents input submitted with the form. */
		name: string;
		/** Initial display value (German Euro string, e.g. "12,50"). */
		value?: string;
		/** Transaction-type accent (default ausgabe/plum). */
		type?: AmountType;
		/** Optional leading sign glyph. */
		sign?: AmountSign;
		required?: boolean;
		disabled?: boolean;
		id?: string;
		placeholder?: string;
		'aria-invalid'?: boolean;
		'aria-describedby'?: string;
		class?: string;
		/** Fires with the parsed cents (or null when empty/invalid). */
		onchange?: (cents: number | null) => void;
	}

	const accentVar: Record<AmountType, string> = {
		ausgabe: 'var(--type-ausgabe)',
		einnahme: 'var(--type-einnahme)',
		spende: 'var(--type-spende)'
	};
</script>

<script lang="ts">
	let {
		name,
		value = '',
		type = 'ausgabe',
		sign = 'none',
		required = false,
		disabled = false,
		id,
		placeholder = '0,00',
		'aria-invalid': ariaInvalidProp,
		'aria-describedby': ariaDescribedBy,
		class: className,
		onchange
	}: AmountFieldProps = $props();

	// `value` seeds the display once; later edits are user-driven (uncontrolled).
	// svelte-ignore state_referenced_locally
	let display = $state(value);

	const cents = $derived.by(() => {
		const t = display.trim();
		if (t === '') return null;
		const c = parseBetragCents(t);
		return Number.isNaN(c) ? null : c;
	});

	// invalid = non-empty but unparseable, OR empty while required.
	const invalid = $derived(
		ariaInvalidProp === true ||
			(display.trim() !== '' && cents === null) ||
			(required && display.trim() === '')
	);

	let firstRun = true;
	$effect(() => {
		// re-read cents so the effect tracks it, then notify (skip the mount run)
		const c = cents;
		if (firstRun) {
			firstRun = false;
			return;
		}
		onchange?.(c);
	});
</script>

<div
	class={cn(HERO_WRAP, invalid && HERO_WRAP_ERROR, className)}
	style="--hero-accent: {accentVar[type]}"
	data-slot="amount-field"
	data-testid="amount-field"
>
	{#if sign !== 'none'}
		<span class={cn(HERO_PREFIX, 'text-[21px] font-semibold leading-none')} aria-hidden="true"
			>{sign === 'minus' ? '−' : '+'}</span
		>
	{/if}
	<input
		{id}
		type="text"
		inputmode="decimal"
		autocomplete="off"
		{required}
		{disabled}
		{placeholder}
		bind:value={display}
		aria-invalid={invalid ? 'true' : undefined}
		aria-describedby={ariaDescribedBy}
		data-testid="amount-field-input"
		class={cn(HERO_INPUT, 'text-[color:var(--hero-accent)]', sign === 'none' && 'pl-4')}
	/>
	<span class="flex-none grid place-items-center pl-1 pr-2.5 text-[18px] font-bold text-[color:var(--hero-accent)] sm:pl-1.5 sm:pr-4" aria-hidden="true">€</span>
	<input type="hidden" {name} value={cents ?? ''} />
</div>

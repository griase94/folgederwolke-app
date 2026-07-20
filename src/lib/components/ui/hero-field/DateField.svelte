<!--
	DateField — the Datum HERO field (F1 shared primitive).

	WHEN TO USE: the big entry-modal date field, sibling of AmountField
	($lib/components/ui/hero-field). Use THIS when a date sits next to an amount
	and must share the hero anatomy. For a normal, compact form field (member
	forms, filters) use the plain $lib/components/ui/date-field/DateField instead
	— same parsing contract, standard 44px control height, no hero chrome.

	Sibling of AmountField (identical anatomy — see hero-field-class.ts). A date
	is a fact, not a type, so the accent is neutral ink (ANDY-LENS §4): the value
	stays ink-900, the prefix is a calendar glyph. Renders TT.MM.JJJJ; a hidden
	input (`name`) always carries the canonical ISO YYYY-MM-DD (or "" when
	empty/invalid) so route actions/Zod keep parsing ISO.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { isoToDisplay, displayToIso, isWithinBounds } from './date-parse.js';
	import { HERO_WRAP, HERO_WRAP_ERROR, HERO_PREFIX, HERO_INPUT } from './hero-field-class.js';

	export interface DateFieldProps {
		/** Name of the hidden ISO input submitted with the form. */
		name: string;
		/** ISO YYYY-MM-DD; empty string means no value. */
		value?: string;
		required?: boolean;
		disabled?: boolean;
		id?: string;
		/** Inclusive bounds, ISO YYYY-MM-DD. */
		min?: string;
		max?: string;
		'aria-invalid'?: boolean;
		'aria-describedby'?: string;
		class?: string;
		/** Fires with the canonical ISO value (after blur). */
		onchange?: (iso: string) => void;
	}
</script>

<script lang="ts">
	let {
		name,
		value = '',
		required = false,
		disabled = false,
		id,
		min,
		max,
		'aria-invalid': ariaInvalidProp,
		'aria-describedby': ariaDescribedBy,
		class: className,
		onchange
	}: DateFieldProps = $props();

	const normalisedProp = $derived(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '');

	let display = $state('');
	let iso = $state('');
	let invalid = $state(false);
	let lastSynced = $state<string | null>(null);
	let inputEl: HTMLInputElement | undefined = $state();

	function commit(next: string) {
		if (next !== iso) {
			iso = next;
			onchange?.(next);
		}
	}

	function revalidate() {
		const t = display.trim();
		if (t === '') {
			inputEl?.setCustomValidity('');
			return;
		}
		const parsed = displayToIso(t);
		inputEl?.setCustomValidity(
			parsed && isWithinBounds(parsed, min, max)
				? ''
				: 'Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.'
		);
	}

	function onBlur() {
		const t = display.trim();
		if (t === '') {
			commit('');
			invalid = required;
			revalidate();
			return;
		}
		const parsed = displayToIso(t);
		if (parsed && isWithinBounds(parsed, min, max)) {
			invalid = false;
			display = isoToDisplay(parsed);
			commit(parsed);
		} else {
			invalid = true;
			commit('');
		}
		revalidate();
	}

	// Sync external prop changes (parent reset / controlled binding). Guard on
	// `!invalid`: a controlled parent that mirrors our onchange sets `value=""`
	// when we commit an INVALID date — without this guard that empty prop would
	// re-run the sync and WIPE the raw "30.02.2026" the user must see + fix (B1).
	$effect(() => {
		if (normalisedProp !== lastSynced && !invalid) {
			lastSynced = normalisedProp;
			iso = normalisedProp;
			display = isoToDisplay(normalisedProp);
			inputEl?.setCustomValidity('');
		}
	});

	const ariaInvalid = $derived(invalid || ariaInvalidProp === true);

	// German inline error (the entry form runs `novalidate`, so no English browser
	// bubble is reachable). We KEEP the raw typed value — "30.02.2026" is never
	// wiped back to the placeholder on blur — and name the problem in German.
	const humanDateError = $derived.by(() => {
		const t = display.trim();
		const m = t.match(/^(\d{1,2})\.(\d{1,2})\./);
		if (m) return `${m[1]}.${m[2]}. — dieses Datum gibt's nicht.`;
		return "Bitte ein gültiges Datum eingeben (TT.MM.JJJJ).";
	});
</script>

<div class="flex flex-col gap-1.5">
	<div
		class={cn(HERO_WRAP, ariaInvalid && HERO_WRAP_ERROR, className)}
		style="--hero-accent: var(--ink-500)"
		data-slot="date-field"
		data-testid="date-field"
	>
		<span class={HERO_PREFIX} aria-hidden="true">
			<CalendarIcon class="size-5" />
		</span>
		<input
			{id}
			type="text"
			inputmode="decimal"
			autocomplete="off"
			placeholder="TT.MM.JJJJ"
			bind:this={inputEl}
			bind:value={display}
			oninput={revalidate}
			onblur={onBlur}
			{required}
			{disabled}
			aria-invalid={ariaInvalid ? 'true' : undefined}
			aria-describedby={ariaDescribedBy}
			data-testid="date-field-input"
			class={cn(HERO_INPUT, 'pr-2.5 text-[color:var(--ink-900)] sm:pr-4')}
		/>
		<input type="hidden" {name} value={iso} />
	</div>
	{#if invalid && display.trim() !== ''}
		<span class="text-xs text-severity-critical" data-slot="date-field-error" role="alert">
			{humanDateError}
		</span>
	{/if}
</div>

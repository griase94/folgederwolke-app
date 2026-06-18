<!--
	DateField - locale-locked (de-DE) date primitive.

	Renders a TT.MM.JJJJ text input. We deliberately do NOT use
	<input type="date"> because:
	  - mobile browsers render it as YYYY-MM-DD regardless of locale,
	  - desktop pickers vary wildly across browsers,
	  - we want the same German display everywhere.

	Form integration: a sibling hidden <input name={name}> always carries the
	canonical ISO YYYY-MM-DD value (or the empty string when invalid / empty),
	so route actions and Zod schemas can keep parsing ISO without any
	per-form transformation.

	Validation: invalid free-text or invalid calendar dates (e.g. 30.02.2026)
	clear the hidden value and set aria-invalid=true. The display field keeps
	whatever the user typed so they can correct it.
-->
<script lang="ts" module>
	export interface DateFieldProps {
		/** ISO YYYY-MM-DD. Empty string means "no value". */
		value?: string;
		/** Name of the hidden ISO input that gets submitted with the form. */
		name: string;
		required?: boolean;
		disabled?: boolean;
		id?: string;
		/** Inclusive lower bound, ISO YYYY-MM-DD. */
		min?: string;
		/** Inclusive upper bound, ISO YYYY-MM-DD. */
		max?: string;
		/** Forced aria-invalid (e.g. set by parent based on server-side error). */
		"aria-invalid"?: boolean;
		/** Forced aria-describedby (e.g. linked error message). */
		"aria-describedby"?: string;
		/** Extra class on the text input. */
		class?: string;
		/** Fires whenever the canonical ISO value changes (after blur). */
		onchange?: (iso: string) => void;
	}
</script>

<script lang="ts">
	import { CalendarDate, parseDate } from "@internationalized/date";
	import { cn } from "$lib/utils.js";
	import { FIELD_CLASS } from '$lib/components/admin/transactions/fields/field-class.js';

	// Aurora FIELD_CLASS + extras: tabular-nums for date digits, aria-invalid
	// ring, disabled state. Replaces the old h-8/rounded-lg/border-input tokens.
	const baseInputClass =
		FIELD_CLASS +
		' tabular-nums aria-invalid:border-severity-critical aria-invalid:ring-2 aria-invalid:ring-severity-critical/20 disabled:cursor-not-allowed disabled:opacity-50';
	// HTML pattern for single-or-double digit day/month + 4-digit year.
	// Assigned to a variable to avoid Svelte misreading the curly-brace
	// quantifier syntax ({1,2}) as a template expression.
	const inputPattern = String.raw`\d{1,2}\.\d{1,2}\.\d{4}`;

	let {
		value = "",
		name,
		required = false,
		disabled = false,
		id,
		min,
		max,
		"aria-invalid": ariaInvalidProp,
		"aria-describedby": ariaDescribedBy,
		class: className,
		onchange,
	}: DateFieldProps = $props();

	function isoToDisplay(iso: string): string {
		if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
		try {
			const d = parseDate(iso);
			const dd = String(d.day).padStart(2, "0");
			const mm = String(d.month).padStart(2, "0");
			const yyyy = String(d.year).padStart(4, "0");
			return `${dd}.${mm}.${yyyy}`;
		} catch {
			return "";
		}
	}

	function displayToIso(display: string): string | null {
		const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(display.trim());
		if (!m) return null;
		const [, dd, mm, yyyy] = m;
		const day = Number(dd);
		const month = Number(mm);
		const year = Number(yyyy);
		if (month < 1 || month > 12) return null;
		if (day < 1 || day > 31) return null;
		try {
			// CalendarDate silently clamps out-of-range days (Feb 30 -> Feb 28)
			// instead of throwing, so we verify the round-trip lossless-ness
			// ourselves to catch invalid calendar dates.
			const cd = new CalendarDate(year, month, day);
			if (cd.day !== day || cd.month !== month || cd.year !== year) {
				return null;
			}
			return cd.toString();
		} catch {
			return null;
		}
	}

	function isWithinBounds(iso: string): boolean {
		if (min && iso < min) return false;
		if (max && iso > max) return false;
		return true;
	}

	// Reactive normalised view of the incoming prop. Using $derived here
	// makes Svelte 5 track the prop properly (a bare `value` read inside
	// $effect would only capture the initial value).
	const normalisedProp = $derived(
		/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "",
	);

	// Internal state is seeded by the sync $effect below on mount; the
	// initializers must be literals (not derived reads) to keep Svelte 5
	// from warning about "captures only the initial value".
	let displayValue = $state("");
	let isoValue = $state("");
	let invalid = $state(false);
	// Track the last prop we've synced from so we can detect *external*
	// (parent-driven) changes vs. our own internal updates. Sentinel
	// value ensures the first $effect run always syncs on mount.
	let lastSyncedProp = $state<string | null>(null);
	// Ref to the visible text input so we can drive native constraint validation
	// from the SUBMITTED value. `required` lives on this visible field, but an
	// invalid-yet-non-empty text (e.g. "31.02.2026") keeps it non-empty while the
	// hidden ISO is "" — which would otherwise let the form submit an empty
	// required date. setCustomValidity closes that gap.
	let inputEl: HTMLInputElement | undefined = $state();

	function commit(nextIso: string): void {
		if (nextIso !== isoValue) {
			isoValue = nextIso;
			onchange?.(nextIso);
		}
	}

	// Keep native validity in sync with the typed text on every change: a
	// non-empty-but-invalid date blocks submission (with a message) instead of
	// silently posting an empty hidden value. Empty text is left to `required`.
	function revalidate(): void {
		const trimmed = displayValue.trim();
		if (trimmed === "") {
			inputEl?.setCustomValidity("");
			return;
		}
		const iso = displayToIso(trimmed);
		inputEl?.setCustomValidity(
			iso && isWithinBounds(iso)
				? ""
				: "Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.",
		);
	}

	function onBlur(): void {
		const trimmed = displayValue.trim();
		if (trimmed === "") {
			commit("");
			invalid = required;
			revalidate();
			return;
		}
		const iso = displayToIso(trimmed);
		if (iso && isWithinBounds(iso)) {
			invalid = false;
			displayValue = isoToDisplay(iso);
			commit(iso);
		} else {
			invalid = true;
			commit("");
		}
		revalidate();
	}

	// External value changes (parent resets the form, controlled binding)
	// should sync display + iso. We deliberately only react when the prop
	// itself changes - not when our internal isoValue diverges.
	$effect(() => {
		if (normalisedProp !== lastSyncedProp) {
			lastSyncedProp = normalisedProp;
			isoValue = normalisedProp;
			displayValue = isoToDisplay(normalisedProp);
			invalid = false;
			inputEl?.setCustomValidity("");
		}
	});

	const ariaInvalid = $derived(invalid || ariaInvalidProp === true);
</script>

<div class="relative" data-slot="date-field">
	<input
		type="text"
		inputmode="decimal"
		autocomplete="off"
		placeholder="TT.MM.JJJJ"
		pattern={inputPattern}
		bind:this={inputEl}
		bind:value={displayValue}
		oninput={revalidate}
		onblur={onBlur}
		{disabled}
		{required}
		{id}
		aria-invalid={ariaInvalid ? "true" : undefined}
		aria-describedby={ariaDescribedBy}
		data-testid="datefield-input"
		data-component="date-field"
		class={cn(baseInputClass, "tabular-nums", className)}
	/>
	<input type="hidden" {name} value={isoValue} />
</div>

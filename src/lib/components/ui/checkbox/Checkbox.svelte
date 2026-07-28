<script lang="ts">
	/**
	 * Checkbox — the Aurora selection checkbox. A visually-hidden native <input>
	 * carries the semantics/keyboard/focus + form participation; a styled surrogate
	 * box renders the tick in the design tokens (mirrors the ConfirmCheck surrogate
	 * pattern, generalised for plain selection — primary tone, optional label).
	 *
	 * Used for row/bulk selection (member list, matrix) where the raw <input>
	 * rendered the UA checkbox and drifted from the Kit visual. `checked` is
	 * bindable for uncontrolled use; controlled callers pass `checked` one-way +
	 * `onchange` (forwarded to the input, together with `data-testid`).
	 */
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import Check from '@lucide/svelte/icons/check';

	let {
		checked = $bindable(false),
		disabled = false,
		size = 'md',
		label,
		labelClass = '',
		class: className = '',
		children,
		...rest
	}: {
		checked?: boolean;
		disabled?: boolean;
		size?: 'sm' | 'md';
		/** Accessible name applied to the wrapping label when there's no visible children label. */
		label?: string;
		/** Extra classes on the wrapping <label> (e.g. visible-label typography). */
		labelClass?: string;
		/** Extra classes on the surrogate box. */
		class?: string;
		children?: Snippet;
	} & Omit<HTMLInputAttributes, 'checked' | 'disabled' | 'size' | 'class' | 'type'> = $props();

	const boxSize = $derived(size === 'sm' ? 'size-4' : 'size-5');
	const iconSize = $derived(size === 'sm' ? 'size-3' : 'size-3.5');
</script>

<label
	class="inline-flex items-center gap-2 {disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'} {labelClass}"
	aria-label={children ? undefined : label}
>
	<input type="checkbox" bind:checked {disabled} class="peer sr-only" {...rest} />
	<span
		class="grid {boxSize} shrink-0 place-items-center rounded-[6px] border-2 transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 {checked
			? 'border-primary bg-primary'
			: 'border-input bg-card'} {className}"
		aria-hidden="true"
	>
		{#if checked}
			<Check class="{iconSize} text-primary-foreground" />
		{/if}
	</span>
	{#if children}
		<span>{@render children()}</span>
	{/if}
</label>

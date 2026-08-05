<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export interface FieldGroupProps {
		/** Label text, without the asterisk — `required` renders that. */
		label: string;
		/** The id of the control this labels. */
		for: string;
		/** Renders the asterisk AND is what the control's own `required` should mirror. */
		required?: boolean;
		/** Renders „(optional)" in the hint line — NEVER in the label (§3). */
		optional?: boolean;
		/** Quiet help under the control. Replaced by `error` while one is present. */
		hint?: string;
		/** Validation message. Announced; replaces the hint. */
		error?: string;
		/**
		 * The control. Receives the a11y wiring it needs so no callsite has to
		 * rebuild it: `describedBy` (id of the hint/error, or undefined) and
		 * `invalid` (mirror onto aria-invalid).
		 */
		children: Snippet<[{ describedBy: string | undefined; invalid: true | undefined }]>;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * FieldGroup — label + control + hint/error in ONE anatomy (§3).
	 *
	 * Before SLOT-FELD the app had 37 distinct label class chains, 8+ error
	 * chains across THREE colour families (`severity-critical`,
	 * `destructive`, raw `text-red-600`) and 7 ways of drawing a required
	 * asterisk — including a bare `*` typed into the label text and one that
	 * said „(erforderlich)" in prose. A form could show two different reds for
	 * the same kind of problem on one screen.
	 *
	 * The contract, fixed here so no callsite decides it again:
	 *  - label `text-sm font-medium text-ink-900`
	 *  - hint  `text-xs text-muted-foreground`
	 *  - error `text-xs text-severity-critical`, `role="alert"`
	 *  - stack `gap-1.5`
	 *  - required ⇒ asterisk in severity-critical, `aria-hidden` (the control's
	 *    own `required` is what a screen reader announces — the glyph is
	 *    decoration and must not be read as "star")
	 *  - optional ⇒ „(optional)" in the HINT, never in the label
	 *
	 * The error REPLACES the hint rather than stacking under it: two lines of
	 * small print under a red-bordered field is where people stop reading.
	 */
	let {
		label,
		for: forId,
		required = false,
		optional = false,
		hint,
		error,
		children,
		class: className
	}: FieldGroupProps = $props();

	const hintText = $derived(
		optional ? [hint, '(optional)'].filter(Boolean).join(' ') : hint
	);

	// The control must POINT at whichever line is showing, or a screen reader
	// reads the field and never the reason it was rejected.
	const errorId = $derived(`${forId}-error`);
	const hintId = $derived(`${forId}-hint`);
	const describedBy = $derived(error ? errorId : hintText ? hintId : undefined);
</script>

<div data-slot="field-group" class={['flex flex-col gap-1.5', className]}>
	<label for={forId} class="text-sm font-medium text-ink-900">
		{label}{#if required}<span class="text-severity-critical" aria-hidden="true">&nbsp;*</span
			>{/if}
	</label>

	{@render children({ describedBy, invalid: error ? true : undefined })}

	{#if error}
		<p
			id={errorId}
			data-slot="field-error"
			class="text-xs text-severity-critical"
			role="alert"
		>
			{error}
		</p>
	{:else if hintText}
		<p id={hintId} data-slot="field-hint" class="text-xs text-muted-foreground">{hintText}</p>
	{/if}
</div>

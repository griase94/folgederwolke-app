<script lang="ts">
	/**
	 * FormFooter — guardrail primitive (master §2.6, spec §9.1).
	 *
	 * Live "Fehlt noch" list states what's missing; pressing submit while
	 * gaps exist FOCUSES the first gap instead of submitting (the button is
	 * never disabled — disabled buttons can't explain themselves). Consumers
	 * mark gap fields with data-missing="true" (merge client AND server/Zod
	 * results into `missing`). The non-field error slot carries network
	 * failures, unique-constraint conflicts, and the Festschreibung race —
	 * a server-side lock rejection should re-render the form read-only with
	 * LockBanner instead (spec §9.1).
	 */
	let {
		missing = [],
		nonFieldError,
		submitLabel = 'Speichern',
		submitting = false
	}: {
		missing?: string[];
		nonFieldError?: { severity: 'warn' | 'critical'; message: string };
		submitLabel?: string;
		submitting?: boolean;
	} = $props();

	function onSubmitClick(e: MouseEvent): void {
		if (missing.length === 0) return;
		e.preventDefault();
		const form = (e.currentTarget as HTMLElement).closest('form');
		form?.querySelector<HTMLElement>('[data-missing="true"]')?.focus();
	}
</script>

<div class="mt-6 flex flex-col gap-3" data-testid="form-footer">
	{#if nonFieldError}
		<div
			role="alert"
			class={'rounded-[10px] border px-3 py-2 text-sm font-medium ' +
				(nonFieldError.severity === 'critical'
					? 'border-severity-critical/30 bg-severity-critical/10 text-severity-critical-text'
					: 'border-severity-warn/30 bg-severity-warn/10 text-severity-warn-text')}
		>
			{nonFieldError.message}
		</div>
	{/if}

	{#if missing.length > 0}
		<p
			class="text-sm text-ink-500"
			data-testid="form-footer-missing"
			aria-live="polite"
			aria-atomic="true"
		>
			<span class="font-medium text-ink-700">Fehlt noch:</span>
			{missing.join(', ')}
		</p>
	{/if}

	<button
		type="submit"
		onclick={onSubmitClick}
		disabled={submitting}
		class={'flex h-11 items-center justify-center rounded-[10px] px-5 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:h-10 ' +
			(missing.length > 0
				? 'bg-primary-strong/70'
				: 'bg-primary-strong hover:bg-primary-strong/85') +
			(submitting ? ' opacity-60' : '')}
	>
		{submitting ? 'Wird gespeichert …' : submitLabel}
	</button>
</div>

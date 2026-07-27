<script lang="ts">
	/**
	 * BulkMarkBar — the ONE docked bulk "als bezahlt markieren" bar for both the
	 * Liste and the Matrix (mitglieder §1 Bulk / §4 `.bulkbar`). Docked at the
	 * card foot (never floating); on mobile it becomes the sticky action-foot.
	 *
	 * "N ausgewählt" (aria-live) · Bezahlt-am (default heute) · calm-green safe
	 * commit (C3a — emerald, never rosa) · Abbrechen. Commit is disabled at zero
	 * selection with an honest gate-line reason (never a silently dead button).
	 */
	import DateField from '$lib/components/ui/date-field/DateField.svelte';

	let {
		count,
		gezahltAm = $bindable(new Date().toISOString().slice(0, 10)),
		submitting = false,
		onCommit,
		onCancel,
		'data-testid': testId = 'bulk-mark-bar'
	}: {
		/** Number of selected open/partial cells. */
		count: number;
		/** Bindable payment date (ISO). Parent seeds the Berlin "today". */
		gezahltAm?: string;
		submitting?: boolean;
		onCommit: (gezahltAm: string) => void;
		onCancel: () => void;
		'data-testid'?: string;
	} = $props();

	const canCommit = $derived(count > 0 && !submitting);
</script>

<div
	data-testid={testId}
	class="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
>
	<span
		class="text-sm font-medium text-foreground"
		aria-live="polite"
		data-testid="{testId}-count"
	>
		{count} ausgewählt
	</span>

	<div class="flex items-center gap-1.5">
		<span class="text-xs text-muted-foreground">Bezahlt am</span>
		<DateField
			name="gezahltAm"
			value={gezahltAm}
			onchange={(iso) => (gezahltAm = iso)}
		/>
	</div>

	<div class="ml-auto flex items-center gap-2">
		<button
			type="button"
			onclick={onCancel}
			data-testid="{testId}-cancel"
			class="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium text-ink-500 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			Abbrechen
		</button>
		<button
			type="button"
			onclick={() => onCommit(gezahltAm)}
			disabled={!canCommit}
			data-testid="{testId}-commit"
			class="inline-flex h-10 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-default disabled:bg-muted disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
		>
			{count} als bezahlt markieren
		</button>
	</div>

	{#if count === 0}
		<p
			class="w-full text-xs text-severity-warn-text"
			data-testid="{testId}-gate"
		>
			Fehlt noch: mindestens eine offene Zelle auswählen.
		</p>
	{/if}
</div>

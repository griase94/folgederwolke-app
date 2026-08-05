<script lang="ts">
	/**
	 * PlaceholderEditor — editable message body with insertable placeholder chips
	 * (`.ph-editor` / `.ph-chip` / `.ph-reset`, erinnerung-senden §4). Clicking a
	 * chip inserts the token at the caret; "Standard wiederherstellen" restores
	 * the default text; an unknown `{Foo}` token surfaces a gentle hint.
	 *
	 * Reusable for any future mail-copy editor. The KNOWN placeholder set defaults
	 * to the Beitrags-Reminder tokens (single-sourced in beitrag-reminder-copy).
	 */
	import { REMINDER_PLACEHOLDERS } from '$lib/domain/beitrag-reminder-copy.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';

	let {
		value = $bindable(''),
		standardText = '',
		placeholders = REMINDER_PLACEHOLDERS,
		label = 'Nachricht',
		'data-testid': testId = 'placeholder-editor'
	}: {
		/** Bindable message text (may contain {Placeholder} tokens). */
		value?: string;
		/** Default text restored by "Standard wiederherstellen". */
		standardText?: string;
		/** Known tokens shown as insertable chips + used for validation. */
		placeholders?: readonly string[];
		label?: string;
		'data-testid'?: string;
	} = $props();

	let textarea = $state<HTMLTextAreaElement | null>(null);

	function insert(ph: string) {
		const el = textarea;
		if (!el) {
			value += ph;
			return;
		}
		const start = el.selectionStart ?? value.length;
		const end = el.selectionEnd ?? value.length;
		value = value.slice(0, start) + ph + value.slice(end);
		// Restore focus + place the caret after the inserted token.
		queueMicrotask(() => {
			el.focus();
			const pos = start + ph.length;
			el.setSelectionRange(pos, pos);
		});
	}

	const known = $derived(new Set(placeholders));
	const unknownTokens = $derived(
		[...value.matchAll(/\{[^}]+\}/g)].map((m) => m[0]).filter((t) => !known.has(t))
	);
	const isDirty = $derived(value !== standardText);

	function reset() {
		value = standardText;
	}
</script>

<div data-testid={testId} class="flex flex-col gap-2">
	<div class="flex items-center justify-between">
		<span class="text-sm font-medium text-foreground">{label}</span>
		<button
			type="button"
			onclick={reset}
			disabled={!isDirty}
			data-testid="{testId}-reset"
			class="text-xs font-medium text-primary-text hover:underline disabled:text-muted-foreground disabled:no-underline disabled:opacity-60"
		>
			Standard wiederherstellen
		</button>
	</div>

	<Textarea
		bind:ref={textarea}
		bind:value
		data-testid="{testId}-textarea"
		rows={4}
	></Textarea>

	<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="Platzhalter einfügen">
		{#each placeholders as ph (ph)}
			<button
				type="button"
				onclick={() => insert(ph)}
				data-testid="{testId}-chip"
				data-placeholder={ph}
				class="rounded-full border border-border bg-muted/50 px-2.5 py-1 font-mono text-xs text-ink-500 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{ph}
			</button>
		{/each}
	</div>

	{#if unknownTokens.length > 0}
		<p class="text-xs text-severity-warn-text" data-testid="{testId}-unknown">
			Unbekannte Platzhalter: {unknownTokens.join(', ')} — bleiben im Text stehen.
		</p>
	{/if}
</div>

<!--
	CopyField — one value, one click, into the bank form (Aurora A-flow S3.1).

	EXTRACTED from the Überweisungs-Werkstatt rather than rebuilt: the page had
	already earned the details that matter, and they are preserved here —
	the ~1.2 s copy→check morph, the reserved icon slot so nothing shifts when it
	morphs, and the "{Label} kopieren" accessible name.

	THE ANNOUNCEMENT LIVES OUTSIDE. A screen reader needs ONE live region per
	page, not one per field: N regions would either be ignored or read over each
	other. So this component reports via `onCopied(label)` and the page hosts a
	single `CopyAnnouncer`. That split is the whole reason the announcer is a
	sibling component and not baked in here.

	`disabled` is a real state, not an absence: the Werkstatt shows a disabled
	"IBAN fehlt" field so the bank-form order stays intact and the gap is
	visible where the value would have been.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';

	export interface CopyFieldProps {
		/** Visible label AND the basis of the accessible name. */
		label: string;
		/** What actually lands on the clipboard. */
		value: string;
		/** testid suffix — `copy-{field}` / `copy-{field}-disabled`. */
		field: string;
		/** Nothing to copy (e.g. no IBAN on file). Renders the gap, not a hole. */
		disabled?: boolean;
		/** Fires with the label once the value is on the clipboard. */
		onCopied?: (label: string) => void;
		/** Fires when the clipboard refused (permissions, insecure context). */
		onError?: (label: string) => void;
		class?: string;
	}

	/** How long the check stays before morphing back. */
	const MORPH_MS = 1200;
</script>

<script lang="ts">
	let {
		label,
		value,
		field,
		disabled = false,
		onCopied,
		onError,
		class: className
	}: CopyFieldProps = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		if (disabled) return;
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			onError?.(label);
			return;
		}
		copied = true;
		onCopied?.(label);
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), MORPH_MS);
	}
</script>

<button
	type="button"
	onclick={copy}
	{disabled}
	data-testid={disabled ? `copy-${field}-disabled` : `copy-${field}`}
	data-copied={copied ? 'true' : undefined}
	aria-label={disabled ? `${label} — nichts zu kopieren` : `${label} kopieren`}
	class={cn(
		'inline-flex h-11 items-center gap-1.5 rounded-full border border-hairline bg-card px-3 text-[13px] font-medium transition-colors md:h-9',
		'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
		disabled
			? 'cursor-not-allowed text-ink-300'
			: 'text-ink-700 hover:text-ink-900',
		className
	)}
>
	<!-- The icon slot is a fixed size so the morph never nudges the label. -->
	<span class="grid size-3.5 shrink-0 place-items-center" aria-hidden="true">
		{#if copied}
			<Check class="size-3.5 text-type-einnahme" />
		{:else}
			<Copy class={cn('size-3.5', disabled ? 'text-ink-300' : 'text-ink-500')} />
		{/if}
	</span>
	{label}
</button>

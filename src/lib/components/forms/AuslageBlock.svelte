<!--
	AuslageBlock — one Auslage in the batch repeater (Aurora A-flow S1, plate
	`.aus-block`). Collapsible: a VALID block collapses to a one-line summary
	(title · amount · Beleg ✓ · date) with a green check index; an OPEN block shows
	its number + a hint and renders the fields in the `body` snippet. Presentation
	only — the form owns validity + the field state. Header is a real
	<button aria-expanded> so Enter/Space toggles (brief §3 keyboard).
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';
	import Check from '@lucide/svelte/icons/check';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	export interface AuslageBlockSummary {
		title: string;
		/** Pre-formatted plum amount (e.g. "24,90 €"). */
		amountLabel: string;
		belegOk?: boolean;
		/** Pre-formatted date (e.g. "04.07.2026"); omit to hide. */
		dateLabel?: string | null;
	}

	export interface AuslageBlockProps {
		/** 1-based display index. */
		index: number;
		open: boolean;
		/** Valid + collapsed → summary + green check; else number + hint. */
		valid: boolean;
		/** Shown when collapsed & valid. */
		summary?: AuslageBlockSummary | null;
		/** Hint under the title when open (e.g. "Beleg, Betrag und was es war"). */
		subtitle?: string;
		/** Show the remove button (hidden for the sole block). */
		removable?: boolean;
		body: Snippet;
		onToggle?: () => void;
		onRemove?: () => void;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		index,
		open,
		valid,
		summary,
		subtitle = 'Beleg, Betrag und was es war',
		removable = true,
		body,
		onToggle,
		onRemove,
		class: className,
		'data-testid': testId = 'auslage-block'
	}: AuslageBlockProps = $props();

	const bodyId = $derived(`aus-block-body-${index}`);
</script>

<div
	class={cn('overflow-hidden rounded-[14px] border border-border bg-card', className)}
	data-testid={testId}
	data-index={index}
	data-open={open}
	data-valid={valid}
	data-slot="auslage-block"
>
	<div class="flex items-center gap-1">
		<button
			type="button"
			aria-expanded={open}
			aria-controls={bodyId}
			onclick={() => onToggle?.()}
			class="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<span
				class={cn('grid size-5 flex-none place-items-center text-ink-300 transition-transform [&_svg]:size-4', open && 'rotate-90')}
				aria-hidden="true"
			>
				<ChevronRight />
			</span>
			<span
				class={cn(
					'grid size-[22px] flex-none place-items-center rounded-full text-[12px] font-bold tabular-nums [&_svg]:size-3.5',
					valid && !open ? 'bg-type-einnahme text-white' : 'bg-secondary text-ink-700'
				)}
				aria-hidden="true"
			>
				{#if valid && !open}<Check />{:else}{index}{/if}
			</span>
			{#if valid && !open && summary}
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-[13px] font-semibold text-ink-900">{summary.title}</span>
					<span class="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-ink-500">
						<span class="font-semibold text-type-ausgabe tabular-nums">{summary.amountLabel}</span>
						{#if summary.belegOk}
							<span aria-hidden="true">·</span>
							<span class="inline-flex items-center gap-1 text-type-einnahme [&_svg]:size-3"><Check aria-hidden="true" />Beleg</span>
						{/if}
						{#if summary.dateLabel}
							<span aria-hidden="true">·</span><span class="tabular-nums">{summary.dateLabel}</span>
						{/if}
					</span>
				</span>
			{:else}
				<span class="flex min-w-0 flex-1 flex-col">
					<span class="text-[13px] font-semibold text-ink-900">Auslage {index}</span>
					<span class="truncate text-[11.5px] text-ink-500">{subtitle}</span>
				</span>
			{/if}
		</button>
		{#if removable}
			<button
				type="button"
				onclick={() => onRemove?.()}
				aria-label="Auslage {index} entfernen"
				class="mr-2 grid size-9 flex-none place-items-center rounded-[9px] text-ink-500 transition-colors hover:bg-severity-critical-tint hover:text-severity-critical-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4"
			>
				<Trash2 aria-hidden="true" />
			</button>
		{/if}
	</div>
	{#if open}
		<div id={bodyId} class="flex flex-col gap-4 border-t border-hairline px-3.5 pt-4 pb-4" data-slot="auslage-block-body">
			{@render body()}
		</div>
	{/if}
</div>

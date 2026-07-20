<!--
	FactsTable — the Aurora key/value facts block (F1 shared primitive).

	ANDY-LENS §1 + Präzisierung: ALL values sit on ONE right-hand ruler
	(tabular where numeric), label column is a fixed width, baselines align.
	A long free-text value renders as a full-width sub-row (`block`) with the
	label on top and the text left-aligned below — never squeezed onto the
	ruler. IBAN is tabular + nowrap and is NEVER middle-ellipsised.

	Data-driven by default (`rows`); a trailing snippet lets callers append
	bespoke rows that still live inside the same ruler.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	/** Value formatting variant — drives ruler alignment + tabular figures. */
	export type FactVariant = 'text' | 'num' | 'amount' | 'date' | 'iban';
	/** Amount tone (transaction-type colour). Only meaningful for `amount`. */
	export type FactTone = 'ausgabe' | 'einnahme' | 'spende';

	export interface FactRow {
		label: string;
		value: string;
		variant?: FactVariant;
		tone?: FactTone;
		/** Force the full-width sub-row layout (long / multi-line free text). */
		block?: boolean;
	}

	export interface FactsTableProps {
		rows?: FactRow[];
		/** Label-column width (kit default 150px). */
		labelWidth?: string;
		class?: string;
		'data-testid'?: string;
		children?: Snippet;
	}

	// Free text longer than this collapses to the full-width sub-row so it never
	// competes with the ruler (kit trigger ≈ 40 chars).
	const BLOCK_THRESHOLD = 40;

	function isBlock(row: FactRow): boolean {
		if (row.block !== undefined) return row.block;
		return (
			(row.variant ?? 'text') === 'text' &&
			(row.value.length > BLOCK_THRESHOLD || row.value.includes('\n'))
		);
	}

	const toneClass: Record<FactTone, string> = {
		ausgabe: 'text-type-ausgabe',
		einnahme: 'text-type-einnahme',
		spende: 'text-type-spende'
	};
</script>

<script lang="ts">
	let {
		rows = [],
		labelWidth = '150px',
		class: className,
		'data-testid': testId = 'facts-table',
		children
	}: FactsTableProps = $props();

	const tabular = (v: FactVariant) => v === 'num' || v === 'amount' || v === 'date' || v === 'iban';
</script>

<dl
	class={cn('w-full', className)}
	style="--facts-lbl: {labelWidth}"
	data-testid={testId}
	data-slot="facts-table"
>
	{#each rows as row (row.label)}
		{@const variant = row.variant ?? 'text'}
		{#if isBlock(row)}
			<!-- full-width sub-row: label on top, text left below, hairline divider -->
			<div
				class="grid grid-cols-1 border-t border-hairline py-2.5 first:border-t-0"
				data-slot="kv-block"
			>
				<dt class="text-xs font-medium text-ink-500">{row.label}</dt>
				<dd class="mt-1 whitespace-pre-line text-[13px] font-medium text-ink-900">{row.value}</dd>
			</div>
		{:else}
			<div
				class="grid min-h-10 items-baseline gap-4 border-t border-hairline py-2.5 first:border-t-0"
				style="grid-template-columns: var(--facts-lbl) minmax(0, 1fr)"
				data-slot="kv"
			>
				<dt class="text-xs font-medium text-ink-500">{row.label}</dt>
				<dd
					class={cn(
						// one ruler: every value is right-aligned, even plain text
						'min-w-0 text-right text-[13px] font-semibold text-ink-900',
						tabular(variant) && 'tabular-nums',
						variant === 'iban' && 'whitespace-nowrap tracking-[0.01em]',
						variant === 'amount' && 'font-bold',
						variant === 'amount' && row.tone && toneClass[row.tone]
					)}
					data-variant={variant}
				>
					{row.value}
				</dd>
			</div>
		{/if}
	{/each}
	{@render children?.()}
</dl>

<!--
	BatchReviewList — the review-before-submit list (Aurora A-flow S1, plate
	`.batch-review`). Appears above the CTA once there are ≥2 blocks: one row per
	Auslage (title · date · Beleg-✓ · plum amount + edit/remove) plus the running
	total. An incomplete block carries a neutral-open "unvollständig" marker (NOT
	amber — it is a not-yet state, not an error). The gate + CTA live in the form
	foot (F1/F2 form-level), not here.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import Receipt from '@lucide/svelte/icons/receipt';
	import Check from '@lucide/svelte/icons/check';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	export interface ReviewItem {
		clientKey: string;
		title: string;
		dateLabel?: string | null;
		betragCents: number | null;
		belegOk?: boolean;
		/** Missing required fields → "unvollständig" marker + no amount. */
		incomplete?: boolean;
	}

	export interface BatchReviewListProps {
		items: ReviewItem[];
		gesamtCents: number;
		onEdit?: (clientKey: string) => void;
		onRemove?: (clientKey: string) => void;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		items,
		gesamtCents,
		onEdit,
		onRemove,
		class: className,
		'data-testid': testId = 'batch-review-list'
	}: BatchReviewListProps = $props();
</script>

<section
	class={cn('overflow-hidden rounded-[16px] border border-border bg-card', className)}
	data-testid={testId}
	data-slot="batch-review-list"
>
	<div class="flex items-baseline justify-between gap-3 border-b border-hairline px-4 py-3">
		<span class="text-[11px] font-bold tracking-wide text-ink-500 uppercase">Vor dem Absenden</span>
		<span class="text-[12px] font-semibold text-ink-700">{items.length} Auslagen</span>
	</div>
	<ul class="m-0 list-none p-0">
		{#each items as item (item.clientKey)}
			<li class="flex items-center gap-3 border-t border-hairline px-4 py-2.5 first:border-t-0" data-slot="brl-row" data-incomplete={item.incomplete ?? false}>
				<span
					class="grid size-8 flex-none place-items-center rounded-[9px] bg-secondary text-ink-500 [&_svg]:size-4"
					aria-hidden="true"
				>
					<Receipt />
				</span>
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-[13px] font-semibold text-ink-900">{item.title || `Auslage`}</span>
					<span class="flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-ink-500">
						{#if item.incomplete}
							<span class="font-semibold text-neutral-open">unvollständig</span>
						{:else}
							{#if item.dateLabel}<span class="tabular-nums">{item.dateLabel}</span>{/if}
							{#if item.belegOk}
								<span aria-hidden="true">·</span>
								<span class="inline-flex items-center gap-1 text-type-einnahme [&_svg]:size-3"><Check aria-hidden="true" />Beleg</span>
							{/if}
						{/if}
					</span>
				</div>
				<div class="flex flex-none items-center gap-0.5">
					<button
						type="button"
						onclick={() => onEdit?.(item.clientKey)}
						aria-label="{item.title || 'Auslage'} bearbeiten"
						class="grid size-8 place-items-center rounded-[8px] text-ink-500 transition-colors hover:bg-secondary hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4"
					>
						<Pencil aria-hidden="true" />
					</button>
					<button
						type="button"
						onclick={() => onRemove?.(item.clientKey)}
						aria-label="{item.title || 'Auslage'} entfernen"
						class="grid size-8 place-items-center rounded-[8px] text-ink-500 transition-colors hover:bg-severity-critical-tint hover:text-severity-critical-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4"
					>
						<Trash2 aria-hidden="true" />
					</button>
				</div>
				<span class="w-[76px] flex-none text-right text-[14px] font-bold tabular-nums text-type-ausgabe">
					{#if !item.incomplete && item.betragCents != null}{formatMoney(item.betragCents)}{:else}—{/if}
				</span>
			</li>
		{/each}
	</ul>
	<div class="flex items-center justify-between gap-3 border-t border-border bg-secondary/40 px-4 py-3">
		<span class="flex flex-col text-[13px] font-semibold text-ink-700">
			Gesamt<small class="text-[11px] font-normal text-ink-500">{items.length} Auslagen · jede kriegt ihre eigene Nummer</small>
		</span>
		<span class="text-[17px] font-extrabold tabular-nums text-type-ausgabe" data-testid="brl-total">{formatMoney(gesamtCents)}</span>
	</div>
</section>

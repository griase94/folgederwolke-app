<!--
	BatchConfirmGroup — the batch receipt group (Aurora A-flow S1, plate
	`.batch-confirmation-group`). Shown on auslage-eingereicht for n>1: one row per
	Auslage (AUS-Nr + bezeichnung + Beleg-✓ + plum amount) and a total. Every AUS
	got its own number; ONE status CTA (rendered by the page) opens the whole
	group. Amounts stay PLUM (`type-ausgabe`). Read-only receipt.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import Receipt from '@lucide/svelte/icons/receipt';
	import Check from '@lucide/svelte/icons/check';

	export interface BatchConfirmItem {
		ausId: string;
		bezeichnung: string;
		betragCents: number;
		belegOk?: boolean;
	}

	export interface BatchConfirmGroupProps {
		items: BatchConfirmItem[];
		gesamtCents: number;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		items,
		gesamtCents,
		class: className,
		'data-testid': testId = 'batch-confirm-group'
	}: BatchConfirmGroupProps = $props();
</script>

<div
	class={cn(
		'w-full overflow-hidden rounded-[16px] border border-border bg-card text-left',
		className
	)}
	data-testid={testId}
	data-slot="batch-confirm-group"
>
	<ul class="m-0 list-none p-0">
		{#each items as item (item.ausId)}
			<li
				class="flex items-center gap-3 border-t border-hairline px-4 py-3 first:border-t-0"
				data-slot="bcg-row"
			>
				<span
					class="grid size-[34px] flex-none place-items-center rounded-[10px] bg-type-ausgabe/10 text-type-ausgabe [&_svg]:size-4.5"
					aria-hidden="true"
				>
					<Receipt />
				</span>
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="text-[12px] font-bold tabular-nums whitespace-nowrap text-ink-900">{item.ausId}</span>
					<span class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-700">
						<span class="min-w-0">{item.bezeichnung}</span>
						{#if item.belegOk}
							<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-type-einnahme [&_svg]:size-3">
								<Check aria-hidden="true" />Beleg
							</span>
						{/if}
					</span>
				</div>
				<span class="flex-none text-[15px] font-bold tabular-nums text-type-ausgabe">
					{formatMoney(item.betragCents)}
				</span>
			</li>
		{/each}
	</ul>
	<div class="flex items-center gap-3 border-t border-border bg-secondary/40 px-4 py-3">
		<span class="text-[13px] font-semibold text-ink-700">
			Gesamt <span class="font-medium text-ink-500">· {items.length} Auslagen</span>
		</span>
		<span class="ml-auto text-[17px] font-extrabold tabular-nums text-type-ausgabe" data-testid="bcg-total">
			{formatMoney(gesamtCents)}
		</span>
	</div>
</div>

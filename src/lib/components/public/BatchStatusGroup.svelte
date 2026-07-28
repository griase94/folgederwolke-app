<!--
	BatchStatusGroup — the batch status group (Aurora A-flow S1, plate `.bsg-*`).
	One submission, several fates: a head (eyebrow + "n Auslagen" + plum Gesamt +
	mixed tally) and one collapsible node per AUS-Nr (id + title + plum amount +
	its OWN status chip). The deep-linked node renders open + focused; the rest
	collapse. Each node NEVER averages to a pseudo-total status — an abgelehnt node
	never visually endangers the erstattet ones (brief §3.6). The focused node is
	open in the SSR markup, so it works without JS (progressive enhancement).
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import AuslageStatusChip from '$lib/components/ui/AuslageStatusChip.svelte';
	import AuslageStatusDetail, {
		type AuslageStatusDetailProps
	} from './AuslageStatusDetail.svelte';
	import type { StatusChipVariant } from '$lib/components/auslagen/status-presentation.js';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	export interface TallyChip {
		variant: StatusChipVariant;
		label: string;
	}

	export interface BatchNode {
		ausId: string;
		bezeichnung: string;
		betragCents: number;
		chip: { variant: StatusChipVariant; label: string };
		detail: AuslageStatusDetailProps;
	}

	export interface BatchStatusGroupProps {
		submittedLabel: string;
		gesamtCents: number;
		tally: TallyChip[];
		nodes: BatchNode[];
		/** The AUS-Nr whose node opens + focuses on load. */
		focusAusId: string;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		submittedLabel,
		gesamtCents,
		tally,
		nodes,
		focusAusId,
		class: className,
		'data-testid': testId = 'batch-status-group'
	}: BatchStatusGroupProps = $props();

	// Initialise open state from the deep-link (SSR renders the focused node open).
	// SvelteSet so in-place add/delete stays reactive (svelte/prefer-svelte-reactivity).
	// One-time seed from props; toggling is user-driven thereafter.
	// svelte-ignore state_referenced_locally
	const open = new SvelteSet(nodes.filter((n) => n.ausId === focusAusId).map((n) => n.ausId));

	function toggle(ausId: string) {
		if (open.has(ausId)) open.delete(ausId);
		else open.add(ausId);
	}

	let headerEls = $state<Record<string, HTMLButtonElement | undefined>>({});
	// After mount, scroll + focus the deep-linked node header (brief §3).
	$effect(() => {
		tick().then(() => {
			const el = headerEls[focusAusId];
			if (el) {
				el.scrollIntoView({ block: 'start', behavior: 'smooth' });
			}
		});
	});
</script>

<div class={cn('flex flex-col', className)} data-testid={testId} data-slot="batch-status-group">
	<!-- head -->
	<div class="mb-4">
		<span class="text-[11px] font-bold tracking-wide text-ink-500 uppercase">
			Diese Einreichung · {submittedLabel}
		</span>
		<div class="mt-1.5 flex items-baseline justify-between gap-3">
			<span class="text-[18px] font-extrabold tracking-tight text-ink-900">{nodes.length} Auslagen</span>
			<span class="text-right text-[17px] font-extrabold tabular-nums text-type-ausgabe">
				<small class="mr-1.5 text-[11px] font-semibold text-ink-500">Gesamt</small>{formatMoney(gesamtCents)}
			</span>
		</div>
		{#if tally.length}
			<div class="mt-2.5 flex flex-wrap gap-1.5" data-testid="batch-tally">
				{#each tally as t (t.label)}
					<AuslageStatusChip variant={t.variant} label={t.label} />
				{/each}
			</div>
		{/if}
	</div>

	<!-- nodes -->
	<ul class="m-0 flex list-none flex-col gap-2.5 p-0">
		{#each nodes as node (node.ausId)}
			{@const isOpen = open.has(node.ausId)}
			{@const isFocus = node.ausId === focusAusId}
			<li
				class={cn(
					'overflow-hidden rounded-[14px] border',
					isFocus ? 'border-[color-mix(in_srgb,var(--primary)_30%,var(--border))]' : 'border-border'
				)}
				data-slot="bsg-node"
				data-focus={isFocus}
				data-open={isOpen}
			>
				<button
					type="button"
					bind:this={headerEls[node.ausId]}
					aria-expanded={isOpen}
					onclick={() => toggle(node.ausId)}
					class="flex w-full items-center gap-3 bg-card px-3.5 py-3 text-left transition-colors hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<span
						class={cn(
							'grid size-5 flex-none place-items-center text-ink-300 transition-transform [&_svg]:size-4',
							isOpen && 'rotate-90'
						)}
						aria-hidden="true"
					>
						<ChevronRight />
					</span>
					<span class="flex min-w-0 flex-1 flex-col">
						<span class="text-[12px] font-bold tabular-nums whitespace-nowrap text-ink-900">{node.ausId}</span>
						<span class="truncate text-[13px] text-ink-700">{node.bezeichnung}</span>
					</span>
					<span class="flex flex-none items-center gap-2.5">
						<span class="text-[14px] font-bold tabular-nums text-type-ausgabe">{formatMoney(node.betragCents)}</span>
						<AuslageStatusChip variant={node.chip.variant} label={node.chip.label} />
					</span>
				</button>
				{#if isOpen}
					<div class="border-t border-hairline px-3.5 pt-3.5 pb-4" data-slot="bsg-body">
						<AuslageStatusDetail {...node.detail} compact />
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</div>

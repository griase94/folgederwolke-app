<script lang="ts">
	/**
	 * MonthGroup — shared month-grouping header (master plan §2.4, plate
	 * transaktionen-v4 `.month-head`). Per-type pages pass that type's month sum;
	 * the unified feed passes the net signed sum plus the Einnahmen/Ausgaben split
	 * that drives the DeltaChip (whether the month leaned income or spending).
	 *
	 * Ruler contract (ANDY-LENS §1): the header shares TransactionRow's column
	 * grid so the per-month Netto lands on the SAME right-edge amount ruler as the
	 * row amounts below it — left label spans the glyph+title columns, the net
	 * sits in the amount column.
	 */
	import type { Snippet } from 'svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { DeltaChip } from '$lib/components/charts/index.js';

	let {
		label,
		subtotalCents,
		count,
		einnahmenCents,
		ausgabenCents,
		netLabel,
		children
	}: {
		label: string;
		subtotalCents?: number;
		/** Row count in the bucket → "· N Buchungen" (feed month head). */
		count?: number;
		/** Feed only: Einnahmen share of the month (drives the DeltaChip). */
		einnahmenCents?: number;
		/** Feed only: Ausgaben share of the month (drives the DeltaChip). */
		ausgabenCents?: number;
		/** Feed only: small stacked caption above the net ("Netto Monat"). */
		netLabel?: string;
		children?: Snippet;
	} = $props();

	const showDelta = $derived(einnahmenCents !== undefined && ausgabenCents !== undefined);
</script>

<section data-month-group>
	<header
		class="grid grid-cols-[3px_26px_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 border-b border-hairline bg-secondary/50 px-1 py-2"
	>
		<!-- Left: calendar glyph + month label + optional count, spanning the
		     rail+chip+title columns so it clears the amount ruler. h2 sits under
		     the PageHeader <h1> on every consumer (heading order h1→h2, no skip). -->
		<div class="col-span-3 flex min-w-0 items-center gap-2 pl-1.5">
			<svg
				class="size-3.5 flex-none text-ink-300"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M8 2v4" />
				<path d="M16 2v4" />
				<rect width="18" height="18" x="3" y="4" rx="2" />
				<path d="M3 10h18" />
			</svg>
			<h2 class="min-w-0 truncate text-[11.5px] font-bold uppercase tracking-wider text-ink-500">
				{label}{#if count !== undefined}<span
						class="ml-1.5 font-medium normal-case tracking-normal text-ink-300"
						>· {count} {count === 1 ? 'Buchung' : 'Buchungen'}</span
					>{/if}
			</h2>
		</div>

		<!-- Amount column: the net on the ruler, with optional caption + DeltaChip. -->
		{#if subtotalCents !== undefined}
			<div class="flex flex-col items-end leading-tight">
				{#if netLabel}
					<span class="text-[10px] font-medium text-ink-500">{netLabel}</span>
				{/if}
				<span class="flex items-center gap-1.5">
					{#if showDelta}
						<DeltaChip einnahmenCents={einnahmenCents ?? 0} ausgabenCents={ausgabenCents ?? 0} />
					{/if}
					<span
						data-testid="month-subtotal"
						class="text-[13px] font-semibold tabular-nums text-ink-900"
						>{formatMoney(subtotalCents, 'always')}</span
					>
				</span>
			</div>
		{/if}
		<span aria-hidden="true"></span>
	</header>
	{#if children}
		<div class="divide-y divide-hairline">{@render children()}</div>
	{/if}
</section>

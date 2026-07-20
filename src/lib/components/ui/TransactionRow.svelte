<script lang="ts">
	/**
	 * TransactionRow — Aurora feed row (master plan §2.4 FROZEN contract).
	 *
	 * Column grid: rail(3px) · gap(10) · glyph(34px) · gap(10) · title(flex,
	 * wrap→truncate) · amount(right,tabular) · action(fixed,right). Heights 44px
	 * desktop / 52px mobile.
	 *
	 * Type glyph: a 34px squircle (kit `.glyph`, radius 9) tinted by
	 * --color-type-* with a Lucide icon (Einnahme arrow ↑ · Ausgabe arrow ↓ ·
	 * Spende gift) — no platform-dependent Unicode. Amount carries the SAME type
	 * hue via the AA-safe *-text tokens with an explicit sign (plate
	 * transaktionen-v4 `.amt-ein/.amt-aus/.amt-spe`, brief §5). The critical red
	 * stays reserved for negative AGGREGATES (month Netto / grand total in ink).
	 */
	import { formatMoney } from '$lib/components/ui/money/money.svelte';

	let {
		type,
		title,
		metaLine,
		statusChips = [],
		amountCents,
		signed = true,
		href,
		rank
	}: {
		type: 'ausgabe' | 'einnahme' | 'spende';
		title: string;
		metaLine: string;
		/**
		 * Optional leading rank number (Betrag-lens ranked list, plate
		 * transaktionen-v4 `.ledger-row.ranked`). Adds a leading rank column; the
		 * trailing columns (amount + action) are unchanged, so the amount stays on
		 * the same right-edge ruler as the un-ranked rows and the feed foot.
		 */
		rank?: number;
		/**
		 * Status chips (master §2.4): per-kind styling. 'warn' (severity-warn
		 * tint) is reserved for genuine incompleteness ("Beleg fehlt"/"ohne
		 * Kategorie"); 'neutral' (default — hairline-bordered, ink-500) is for
		 * everything else (Genehmigt/Erstattet/Geprüft, Bescheinigungs-Nr,
		 * "aus Rechnung FDW-…"). Brand pink is BANNED on warnings (spec §2).
		 */
		statusChips?: { label: string; kind?: 'warn' | 'neutral' }[];
		amountCents: number;
		signed?: true;
		href: string;
	} = $props();

	const CHIP: Record<'ausgabe' | 'einnahme' | 'spende', string> = {
		ausgabe: 'bg-type-ausgabe-tint text-type-ausgabe',
		einnahme: 'bg-type-einnahme-tint text-type-einnahme',
		spende: 'bg-type-spende-tint text-type-spende'
	};
	// AA-safe per-type amount hue (plate `.amt-ein/.amt-aus/.amt-spe`, brief §5).
	const AMT: Record<'ausgabe' | 'einnahme' | 'spende', string> = {
		ausgabe: 'text-(--ausgabe-text)',
		einnahme: 'text-(--einnahme-text)',
		spende: 'text-(--spende-text)'
	};

	const amountLabel = $derived(formatMoney(amountCents, signed ? 'always' : 'auto'));
	const a11yName = $derived(`${title}, ${amountLabel}`);
	// Ranked (Betrag-lens) prepends a rank column; the trailing amount+action
	// columns are identical, so the amount ruler is unchanged.
	const gridCols = $derived(
		rank === undefined
			? 'grid-cols-[3px_34px_minmax(0,1fr)_auto_auto]'
			: 'grid-cols-[24px_3px_34px_minmax(0,1fr)_auto_auto]'
	);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	{href}
	aria-label={a11yName}
	data-testid="txn-row"
	data-kind={type}
	class={'group grid min-h-[52px] items-center gap-x-2.5 rounded-[10px] px-1 py-1 hover:bg-(--surface-glass) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 md:min-h-11 ' +
		gridCols}
>
	{#if rank !== undefined}
		<span
			aria-hidden="true"
			class="text-center text-[12.5px] font-bold tabular-nums text-ink-300">{rank}</span
		>
	{/if}
	<span aria-hidden="true" class="h-7 w-[3px]"></span>
	<span
		data-slot="row-glyph"
		class={'flex size-[34px] items-center justify-center rounded-[9px] ' + CHIP[type]}
		aria-hidden="true"
	>
		<svg
			class="size-[18px]"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			{#if type === 'einnahme'}
				<path d="M7 7h10v10" /><path d="M7 17 17 7" />
			{:else if type === 'ausgabe'}
				<path d="m7 7 10 10" /><path d="M17 7v10H7" />
			{:else}
				<rect width="20" height="5" x="2" y="7" rx="1" /><path d="M12 7v14" /><path
					d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"
				/><path
					d="M7.5 7a2.5 2.5 0 0 1 0-5C10 2 12 5.5 12 7c0-1.5 2-5 4.5-5a2.5 2.5 0 0 1 0 5"
				/>
			{/if}
		</svg>
	</span>
	<span class="flex min-w-0 flex-col">
		<span class="line-clamp-2 text-[15px] font-medium text-ink-900 md:truncate md:text-sm">{title}</span
		>
		<span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 md:flex-nowrap">
			<span class="min-w-0 text-xs text-ink-500 [overflow-wrap:anywhere] md:truncate">{metaLine}</span>
			{#each statusChips as chip (chip.label)}
				<span
					data-testid="row-chip"
					class={'shrink-0 rounded-full px-1.5 py-px text-[11px] font-medium ' +
						(chip.kind === 'warn'
							? 'bg-severity-warn/15 text-severity-warn-text'
							: 'border border-(--hairline) bg-card text-ink-500')}
					>{chip.label}</span
				>
			{/each}
		</span>
	</span>
	<span
		data-testid="txn-row-amount"
		class={'pl-3 text-right text-sm font-semibold tabular-nums ' + AMT[type]}>{amountLabel}</span
	>
	<span aria-hidden="true"></span>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->

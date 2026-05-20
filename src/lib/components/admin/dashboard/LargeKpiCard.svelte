<script lang="ts" module>
	/**
	 * Headline KPI tile used at the top of the dashboard.
	 *
	 * Composition (per C3 spec):
	 *   shadcn Card  →  label + Money + LY-delta chip + Sparkline
	 *
	 * All EUR values are integer cents (ADR-0003). LY delta is rendered as
	 * a +/- percentage relative to last year's same-period value. When last
	 * year is zero or unknown, the chip falls back to "n/v" (not available).
	 */
	export interface LargeKpiCardProps {
		label: string;
		valueInCents: number;
		sparklineData: number[];
		lyValueInCents: number;
		/** Optional href if the card should be a link. */
		href?: string;
		/**
		 * Side-of-ledger hint. Drives the LY-delta chip color logic ONLY:
		 * for income, "up" is positive; for expense, "up" is negative. The
		 * sparkline itself is foreground-neutral per UI-008 (C3-8).
		 */
		tone?: 'income' | 'expense';
	}

	// C3-12 (cycle 2): single source of truth for LY-delta math. Live in
	// $lib/domain/cashflow.ts (client-safe — no server imports). Local
	// `lyDeltaPct` re-export preserves the public API of this component
	// module (legacy unit tests + dashboard.test.ts integration tests
	// import `lyDeltaPct` from here).
	export { computeLyDeltaPct as lyDeltaPct } from '$lib/domain/cashflow.js';
</script>

<script lang="ts">
	import { Card } from '$lib/components/ui/card/index.js';
	import { Money } from '$lib/components/ui/money/index.js';
	import Sparkline from './Sparkline.svelte';
	import { cn } from '$lib/utils.js';
	import { computeLyDeltaPct } from '$lib/domain/cashflow.js';

	let {
		label,
		valueInCents,
		sparklineData,
		lyValueInCents,
		href,
		tone = 'income',
	}: LargeKpiCardProps = $props();

	const delta = $derived(computeLyDeltaPct(valueInCents, lyValueInCents));
	const deltaSign = $derived(
		delta === null ? 'neutral' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
	);

	// For income, "up" is good (emerald); for expense, "up" is bad (rose).
	const chipTone = $derived(() => {
		if (delta === null) return 'neutral';
		if (tone === 'income') return delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
		return delta > 0 ? 'negative' : delta < 0 ? 'positive' : 'neutral';
	});

	// C3-8 (cycle 2): sparkline is foreground-neutral regardless of
	// side-of-ledger. Only the LY-delta chip colors by direction.
	const sparkTone = 'neutral';

	const deltaLabel = $derived(() => {
		if (delta === null) return '— vs. Vorjahr';
		const sign = delta > 0 ? '+' : '';
		return `${sign}${delta}% vs. Vorjahr`;
	});

	const chipClass = $derived(() => {
		const tone = chipTone();
		if (tone === 'positive')
			return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400';
		if (tone === 'negative')
			return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400';
		return 'bg-muted text-muted-foreground';
	});
</script>

{#snippet body()}
	<div class="flex h-full flex-col gap-3 p-5">
		<p class="text-sm font-medium text-muted-foreground">{label}</p>
		<div class="flex items-baseline gap-3">
			<span class="text-3xl font-semibold tracking-tight tabular-nums">
				<Money valueInCents={valueInCents} forceSign="never" />
			</span>
			<span
				data-testid="ly-delta-chip"
				data-sign={deltaSign}
				class={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', chipClass())}
			>
				{deltaLabel()}
			</span>
		</div>
		<div class="mt-auto">
			<Sparkline data={sparklineData} tone={sparkTone} width={240} height={48} />
		</div>
	</div>
{/snippet}

<!-- eslint-disable svelte/no-navigation-without-resolve -->
{#if href}
	<a
		{href}
		class="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
		data-testid="large-kpi-card-link"
	>
		<Card class="hover:shadow-md transition-shadow">
			{@render body()}
		</Card>
	</a>
{:else}
	<Card>
		{@render body()}
	</Card>
{/if}
<!-- eslint-enable svelte/no-navigation-without-resolve -->

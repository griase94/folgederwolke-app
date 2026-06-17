<script lang="ts">
	/**
	 * MonthGroup — shared month-grouping header (master plan §2.4).
	 * Per-type pages pass that type's month sum; the unified feed (slice 5)
	 * passes the net signed sum — quiet styling either way (spec §8).
	 */
	import type { Snippet } from 'svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';

	let {
		label,
		subtotalCents,
		children
	}: { label: string; subtotalCents?: number; children?: Snippet } = $props();
</script>

<section data-month-group>
	<header class="flex items-baseline justify-between border-b border-hairline pb-1.5 pt-4 first:pt-0">
		<h3 class="text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</h3>
		{#if subtotalCents !== undefined}
			<span data-testid="month-subtotal" class="text-xs font-medium tabular-nums text-ink-500"
				>{formatMoney(subtotalCents, 'always')}</span
			>
		{/if}
	</header>
	{#if children}
		<div class="divide-y divide-hairline">{@render children()}</div>
	{/if}
</section>

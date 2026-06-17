<script lang="ts">
	/**
	 * TaskRow — Aurora task row (master plan §2.4 FROZEN contract — do not
	 * change path or prop signature without flagging).
	 *
	 * Grid: rail(3px) · gap(10) · chip(26px) · gap(10) · title(flex,truncate)
	 *       · amount(right,tabular) · action(fixed,right).
	 * Heights: 44px desktop / 52px mobile, 15px mobile title (spec §4).
	 * Entire row is ONE <a>; accessible name `{title}, {amount}, {ctaLabel}`;
	 * the CTA is a visual affordance only (spec §5 SR contract).
	 *
	 * CTA emphasis derives from railKind:
	 *   'critical' → filled red (rank-0 owns the single filled CTA)
	 *   'rank1'    → filled primary-strong (page's only filled CTA otherwise)
	 *   'warn'/'default' → text link.
	 */
	import type { Snippet } from 'svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';

	let {
		railKind = 'default',
		chipIcon,
		title,
		amountCents,
		ctaLabel,
		href,
		severity
	}: {
		railKind: 'rank1' | 'warn' | 'critical' | 'default';
		chipIcon: Snippet;
		title: string;
		amountCents?: number;
		ctaLabel: string;
		href: string;
		severity?: 'warn' | 'critical';
	} = $props();

	const amountLabel = $derived(amountCents !== undefined ? formatMoney(amountCents) : '');
	const a11yName = $derived(
		amountCents !== undefined ? `${title}, ${amountLabel}, ${ctaLabel}` : `${title}, ${ctaLabel}`
	);

	const railClass = $derived(
		railKind === 'rank1'
			? '[background-image:var(--gradient-brand)]'
			: railKind === 'critical'
				? 'bg-severity-critical'
				: railKind === 'warn'
					? 'bg-severity-warn'
					: '[background-image:var(--gradient-brand-soft)]'
	);

	// severity is part of the frozen prop contract; the title tone darkens for
	// critical rows so the warning reads even before color is perceived.
	const titleClass = $derived(severity === 'critical' ? 'text-ink-900' : 'text-ink-700');
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	{href}
	aria-label={a11yName}
	data-testid="task-row"
	data-rail={railKind}
	class="group grid h-13 grid-cols-[3px_26px_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 rounded-[10px] px-1 hover:bg-(--surface-glass) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 md:h-11"
>
	<span aria-hidden="true" class={'h-7 w-[3px] rounded-full ' + railClass}></span>
	<span class="flex size-[26px] items-center justify-center" aria-hidden="true">
		{@render chipIcon()}
	</span>
	<span class={'truncate text-[15px] font-medium md:text-sm ' + titleClass}>{title}</span>
	<span class="pl-3 text-right text-sm font-medium tabular-nums text-ink-700">{amountLabel}</span>
	<span class="ml-3 flex w-36 items-center justify-end" data-testid="task-cta-slot">
		{#if railKind === 'critical'}
			<span
				data-testid="task-cta"
				class="inline-flex h-7 items-center rounded-full bg-severity-critical px-3 text-[13px] font-semibold text-white"
			>{ctaLabel}</span>
		{:else if railKind === 'rank1'}
			<span
				data-testid="task-cta"
				class="inline-flex h-7 items-center rounded-full bg-primary-strong px-3 text-[13px] font-semibold text-white shadow-(--glow-brand)"
			>{ctaLabel}</span>
		{:else}
			<span
				data-testid="task-cta"
				class="text-[13px] font-medium text-primary-text group-hover:underline"
			>{ctaLabel}</span>
		{/if}
	</span>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->

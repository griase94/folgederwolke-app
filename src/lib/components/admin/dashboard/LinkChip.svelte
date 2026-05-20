<script lang="ts" module>
	/**
	 * Small navigation chip used below the LargeKpiCards.
	 * Each chip links to a pre-filtered route (resolves UI-008 link affordances,
	 * UX-330 dashboard liveness, JB-005 "cards must drill in somewhere").
	 */
	export interface LinkChipProps {
		label: string;
		/** Display value — already-formatted money string, count, or status text. */
		value: string;
		href: string;
		ariaLabel?: string;
		/** Optional tone for the value badge. */
		tone?: 'default' | 'success' | 'warning' | 'danger';
	}
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';

	let { label, value, href, ariaLabel, tone = 'default' }: LinkChipProps = $props();

	const badgeClass = $derived(() => {
		switch (tone) {
			case 'success':
				return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300';
			case 'warning':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
			case 'danger':
				return 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300';
			default:
				return 'bg-muted text-foreground';
		}
	});
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	{href}
	data-testid="link-chip"
	aria-label={ariaLabel}
	class="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
>
	<span class="text-sm font-medium text-muted-foreground group-hover:text-foreground">
		{label}
	</span>
	<span
		class={cn(
			'inline-flex min-w-[2.5ch] items-center justify-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums',
			badgeClass(),
		)}
	>
		{value}
	</span>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->

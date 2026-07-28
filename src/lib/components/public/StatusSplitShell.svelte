<!--
	StatusSplitShell — the status split (Aurora A-flow S1, plate
	`.split.status-split`). Same two-column frame as SplitCardShell but the aside
	carries a STATE WASH (the medallion carries the tone; this is a soft backdrop):
	done = green, reject = red, s404 = neutral-grey (deliberately quieter than
	reject), default = brand. `centerMain` centres the panel for the 404 search.
	Brand lives in the (public) layout header — no second wordmark here.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	export type StatusShellTone = 'default' | 'done' | 'reject' | 's404';

	export interface StatusSplitShellProps {
		tone?: StatusShellTone;
		aside: Snippet;
		main: Snippet;
		centerMain?: boolean;
		class?: string;
		'data-testid'?: string;
	}

	const asideWash: Record<StatusShellTone, string> = {
		default: 'bg-[linear-gradient(158deg,color-mix(in_srgb,var(--primary)_7%,var(--card)),var(--card)_62%)]',
		done: 'bg-[linear-gradient(158deg,color-mix(in_srgb,var(--type-einnahme)_11%,var(--card)),var(--card)_62%)]',
		reject:
			'bg-[linear-gradient(158deg,color-mix(in_srgb,var(--sev-critical)_10%,var(--card)),var(--card)_60%)]',
		s404: 'bg-[linear-gradient(158deg,color-mix(in_srgb,var(--ink-500)_9%,var(--card)),var(--card)_58%)]'
	};
</script>

<script lang="ts">
	let {
		tone = 'default',
		aside,
		main,
		centerMain = false,
		class: className,
		'data-testid': testId = 'status-split-shell'
	}: StatusSplitShellProps = $props();
</script>

<div
	class={cn(
		'mx-auto w-full max-w-5xl overflow-hidden rounded-[24px] border border-border bg-card shadow-[var(--shadow-card)]',
		'lg:grid lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)]',
		className
	)}
	data-testid={testId}
	data-tone={tone}
	data-slot="status-split-shell"
>
	<aside
		class={cn(
			'flex flex-col gap-0 border-b border-hairline px-6 py-7 lg:border-r lg:border-b-0 lg:px-8 lg:py-9',
			asideWash[tone]
		)}
		data-slot="status-aside"
	>
		{@render aside()}
	</aside>
	<div
		class={cn('flex flex-col px-5 py-6 lg:px-9 lg:py-9', centerMain && 'lg:justify-center')}
		data-slot="status-panel"
	>
		{@render main()}
	</div>
</div>

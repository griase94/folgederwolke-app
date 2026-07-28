<!--
	SplitCardShell — the public two-column card (Aurora A-flow S1, plate
	`.splitcard`). Left `aside` = the hero (eyebrow, headline, lead, journey);
	right `main` = the form / confirmation. One column on mobile (aside hero
	first, then main); two columns from `lg`. `center` centres the main column
	for the confirmation screen. Brand + the "other door" live in the (public)
	layout header, so the aside carries no second wordmark (ANDY-LENS — one logo).
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	export interface SplitCardShellProps {
		/** Left hero column. */
		aside: Snippet;
		/** Right content column. */
		main: Snippet;
		/** Centre the main column (confirmation screen). */
		center?: boolean;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		aside,
		main,
		center = false,
		class: className,
		'data-testid': testId = 'split-card-shell'
	}: SplitCardShellProps = $props();
</script>

<div
	class={cn(
		'mx-auto w-full max-w-5xl overflow-hidden rounded-[24px] border border-border bg-card shadow-[var(--shadow-card)]',
		'lg:grid lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)]',
		className
	)}
	data-testid={testId}
	data-slot="split-card-shell"
>
	<aside
		class="relative flex flex-col gap-6 border-b border-hairline bg-[linear-gradient(158deg,color-mix(in_srgb,var(--primary)_7%,var(--card)),var(--card)_62%)] px-6 py-7 lg:border-r lg:border-b-0 lg:px-8 lg:py-9"
		data-slot="split-aside"
	>
		{@render aside()}
	</aside>
	<div
		class={cn('flex flex-col px-5 py-6 lg:px-9 lg:py-9', center && 'lg:justify-center')}
		data-slot="split-main"
	>
		{@render main()}
	</div>
</div>

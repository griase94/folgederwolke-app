<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";
	import type { Snippet } from "svelte";

	export type PageHeaderProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		heading: string;
		eyebrow?: string;
		description?: string;
		/** Snippet rendered in the actions slot (right-aligned). */
		actions?: Snippet;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		class: className,
		heading,
		eyebrow,
		description,
		actions,
		...restProps
	}: PageHeaderProps = $props();
</script>

<header
	bind:this={ref}
	data-slot="page-header"
	class={cn(
		"mb-6 flex flex-col gap-3 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between",
		className
	)}
	{...restProps}
>
	<div class="flex flex-col gap-1.5 min-w-0">
		{#if eyebrow}
			<span
				data-testid="page-header-eyebrow"
				data-slot="page-header-eyebrow"
				class="text-muted-foreground text-xs font-medium uppercase tracking-wide"
			>
				{eyebrow}
			</span>
		{/if}
		<h1
			data-slot="page-header-heading"
			class="text-foreground text-2xl font-semibold leading-tight tracking-tight sm:text-3xl"
		>
			{heading}
		</h1>
		{#if description}
			<p
				data-slot="page-header-description"
				class="text-muted-foreground mt-1 text-sm leading-relaxed"
			>
				{description}
			</p>
		{/if}
	</div>
	{#if actions}
		<div
			data-testid="page-header-actions"
			data-slot="page-header-actions"
			class="flex shrink-0 items-center gap-2"
		>
			{@render actions()}
		</div>
	{/if}
</header>

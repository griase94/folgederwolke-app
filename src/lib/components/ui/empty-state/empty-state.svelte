<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";
	import type { Snippet } from "svelte";

	export type EmptyStateProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		title: string;
		description?: string;
		/** Optional icon/illustration snippet, rendered above the title. */
		icon?: Snippet;
		/** Optional CTA snippet (typically a Button), rendered below the description. */
		cta?: Snippet;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		class: className,
		title,
		description,
		icon,
		cta,
		...restProps
	}: EmptyStateProps = $props();
</script>

<div
	bind:this={ref}
	data-slot="empty-state"
	class={cn(
		"flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 py-12 text-center",
		className
	)}
	{...restProps}
>
	{#if icon}
		<div
			data-testid="empty-state-icon"
			data-slot="empty-state-icon"
			class="text-muted-foreground/70 mb-1"
			aria-hidden="true"
		>
			{@render icon()}
		</div>
	{/if}
	<h3
		data-slot="empty-state-title"
		class="text-foreground text-base font-semibold leading-snug"
	>
		{title}
	</h3>
	{#if description}
		<p
			data-slot="empty-state-description"
			class="text-muted-foreground max-w-sm text-sm leading-relaxed"
		>
			{description}
		</p>
	{/if}
	{#if cta}
		<div
			data-testid="empty-state-cta"
			data-slot="empty-state-cta"
			class="mt-2 flex items-center gap-2"
		>
			{@render cta()}
		</div>
	{/if}
</div>

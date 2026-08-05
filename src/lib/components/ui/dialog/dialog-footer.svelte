<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";
	import { Dialog as DialogPrimitive } from "bits-ui";
	import { Button } from "$lib/components/ui/button/index.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		showCloseButton = false,
		equal = false,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		showCloseButton?: boolean;
		/**
		 * Give every footer button the same width instead of sizing each to its
		 * label. Use it when the two choices are a real decision (cancel vs. a
		 * destructive confirm): unequal widths read as a recommendation, and a
		 * rejection dialog must not nudge. Mobile already stacks them full-width.
		 *
		 * Give the buttons the SAME border width (a filled one needs
		 * `border-transparent`): `flex: 1 1 0` splits the free space and then adds
		 * each item's border on top, so a bordered button ends up 2px wider than a
		 * borderless one — measured, not theoretical.
		 */
		equal?: boolean;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="dialog-footer"
	class={cn(
		"bg-muted/50 -mx-4 -mb-4 rounded-b-xl border-t p-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
		equal && "sm:[&>*]:flex-1 sm:[&>*]:basis-0",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	{#if showCloseButton}
		<DialogPrimitive.Close>
			{#snippet child({ props })}
				<Button variant="outline" {...props}>Close</Button>
			{/snippet}
		</DialogPrimitive.Close>
	{/if}
</div>

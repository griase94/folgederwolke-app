<script lang="ts">
	/**
	 * Textarea — the Kit multi-line field. Wears FIELD_CLASS minus its height:
	 * a textarea sizes by rows, so `h-11` would cap it at one line.
	 *
	 * SLOT-FELD created this: the app had 15 raw textareas, several of them
	 * hand-copying FIELD_CLASS-minus-the-height with the padding drifting
	 * between `py-2` and `py-2.5`.
	 */
	import type { HTMLTextareaAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { FIELD_CLASS } from "$lib/components/ui/field-class/index.js";

	/** FIELD_CLASS without the single-line height — a textarea grows by rows. */
	const TEXTAREA_BASE = FIELD_CLASS.replace("h-11 min-h-11 ", "");

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		"data-slot": dataSlot = "textarea",
		...restProps
	}: WithElementRef<HTMLTextareaAttributes> & { "data-slot"?: string } = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		TEXTAREA_BASE,
		"min-h-20 resize-y py-2.5 leading-relaxed transition-colors",
		"aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
		"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
		"placeholder:text-muted-foreground",
		className
	)}
	bind:value
	{...restProps}
></textarea>

<script lang="ts">
	/**
	 * Select — the Kit dropdown. Wears FIELD_CLASS, the ONE field baseline.
	 *
	 * SLOT-FELD created this: the app had 29 raw `<select>` elements across
	 * roughly a dozen anatomies (h-9, h-10, h-11, min-h-9, and one styled
	 * entirely in scoped CSS), because there was no Kit select to reach for.
	 *
	 * `pr-9` + the chevron: a native select needs room for its own arrow on
	 * some platforms and ours on all of them; `appearance-none` makes the
	 * rendering identical across browsers instead of Safari-tall.
	 */
	import type { HTMLSelectAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { FIELD_CLASS } from "$lib/components/ui/field-class/index.js";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		"data-slot": dataSlot = "select",
		children,
		...restProps
	}: WithElementRef<HTMLSelectAttributes> & { "data-slot"?: string } = $props();
</script>

<div class="relative w-full">
	<select
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			FIELD_CLASS,
			"appearance-none pr-9 transition-colors",
			"aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
			"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		bind:value
		{...restProps}
	>
		{@render children?.()}
	</select>
	<svg
		class="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-500"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="m6 9 6 6 6-6" />
	</svg>
</div>

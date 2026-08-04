<script lang="ts">
	/**
	 * Input — the Kit text field. Wears FIELD_CLASS, the ONE field baseline
	 * (DESIGN-GUIDELINES §3).
	 *
	 * SLOT-FELD: this used to ship the shadcn default — `h-8 rounded-lg
	 * border-input … focus-visible:ring-3`. That put a second, contradicting
	 * baseline into the app: 33 callsites inherited a 32px control that
	 * disagreed with FIELD_CLASS on height, radius, border token AND ring width,
	 * and not one of them overrode it. MemberDialog stacked h-8 inputs against
	 * h-11 DateFields and an h-9 select in a single dialog because of it.
	 *
	 * The `file:` utilities stay — a file input still needs its button styled —
	 * and the aria-invalid/disabled states keep the Kit's own tokens.
	 */
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";
	import { FIELD_CLASS } from "$lib/components/ui/field-class/index.js";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	}: Props = $props();

	const BASE = cn(
		FIELD_CLASS,
		"min-w-0 transition-colors",
		// Invalid + disabled states (Kit tokens, unchanged by SLOT-FELD).
		"aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
		"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-input/50 dark:disabled:bg-input/80",
		"placeholder:text-muted-foreground",
		// A file input keeps its button chrome.
		"file:h-6 file:inline-flex file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
	);
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(BASE, className)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(BASE, className)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}

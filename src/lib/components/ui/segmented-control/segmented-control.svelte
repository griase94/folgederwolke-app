<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	export type SegmentedOption = {
		value: string;
		label: string;
		disabled?: boolean;
	};

	export type SegmentedControlProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		options: SegmentedOption[];
		value: string;
		onChange: (value: string) => void;
		/** Accessible label for the radiogroup. */
		ariaLabel?: string;
		size?: "sm" | "default";
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		class: className,
		options,
		value,
		onChange,
		ariaLabel,
		size = "default",
		...restProps
	}: SegmentedControlProps = $props();

	function selectableIndices(): number[] {
		return options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i !== -1);
	}

	function moveSelection(direction: 1 | -1) {
		const indices = selectableIndices();
		if (indices.length === 0) return;
		const currentIdx = options.findIndex((o) => o.value === value);
		const currentSlot = indices.indexOf(currentIdx);
		// If current is disabled (currentSlot === -1) start from beginning/end
		let nextSlot: number;
		if (currentSlot === -1) {
			nextSlot = direction === 1 ? 0 : indices.length - 1;
		} else {
			nextSlot = (currentSlot + direction + indices.length) % indices.length;
		}
		const nextIdx = indices[nextSlot];
		if (nextIdx === undefined) return;
		const next = options[nextIdx];
		if (next && next.value !== value) onChange(next.value);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "ArrowRight" || e.key === "ArrowDown") {
			e.preventDefault();
			moveSelection(1);
		} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
			e.preventDefault();
			moveSelection(-1);
		} else if (e.key === "Home") {
			e.preventDefault();
			const indices = selectableIndices();
			const firstIdx = indices[0];
			if (firstIdx !== undefined) {
				const first = options[firstIdx];
				if (first && first.value !== value) onChange(first.value);
			}
		} else if (e.key === "End") {
			e.preventDefault();
			const indices = selectableIndices();
			const lastIdx = indices[indices.length - 1];
			if (lastIdx !== undefined) {
				const last = options[lastIdx];
				if (last && last.value !== value) onChange(last.value);
			}
		}
	}

	function handleClick(opt: SegmentedOption) {
		if (opt.disabled) return;
		if (opt.value !== value) onChange(opt.value);
	}
</script>

<div
	bind:this={ref}
	data-slot="segmented-control"
	data-size={size}
	role="radiogroup"
	aria-label={ariaLabel}
	tabindex="0"
	onkeydown={handleKeydown}
	class={cn(
		"bg-muted/60 border-border/60 ring-foreground/5 relative inline-flex items-center gap-0.5 rounded-lg border p-0.5 ring-1",
		"focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-2",
		size === "sm" ? "h-7 text-xs" : "h-8 text-sm",
		className
	)}
	{...restProps}
>
	{#each options as opt (opt.value)}
		{@const selected = opt.value === value}
		<button
			type="button"
			role="radio"
			aria-checked={selected}
			aria-label={opt.label}
			disabled={opt.disabled}
			data-state={selected ? "on" : "off"}
			tabindex={selected ? 0 : -1}
			onclick={() => handleClick(opt)}
			class={cn(
				"relative inline-flex items-center justify-center rounded-md font-medium transition-colors",
				"focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
				size === "sm" ? "h-6 px-2" : "h-7 px-3",
				selected
					? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
					: "text-muted-foreground hover:text-foreground"
			)}
		>
			{opt.label}
		</button>
	{/each}
</div>

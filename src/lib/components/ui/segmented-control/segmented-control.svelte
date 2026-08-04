<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";
	import type { Snippet } from "svelte";

	export type SegmentedOption = {
		value: string;
		label: string;
		disabled?: boolean;
		/**
		 * Optional Svelte snippet rendered inside the segment button, BEFORE
		 * the label. Used by C2 YearSwitcher to put a lock icon inside each
		 * closed-year segment (UI-009, C2-5). The snippet receives the
		 * option's `value` so a single shared snippet can serve every
		 * option that needs an icon. Keep icons aria-hidden so the
		 * segment's accessible name (from `label`) stays clean for SR.
		 */
		icon?: Snippet<[string]>;
	};

	export type SegmentedControlProps = WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		options: SegmentedOption[];
		value: string;
		onChange: (value: string) => void;
		/** Accessible label for the radiogroup. */
		ariaLabel?: string;
		size?: "sm" | "default";
		/**
		 * `default` — the compact radiogroup used for filters and switches.
		 * `lens`    — the Werkstatt's recessed-track view switcher (Abnahme #5):
		 *             taller, touch-sized, and semantically TABS. Two lenses on
		 *             the same data are views, not mutually exclusive values, so
		 *             tablist/tab is the honest role — a radiogroup would tell a
		 *             screen reader the user is picking a value.
		 */
		variant?: "default" | "lens";
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
		variant = "default",
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
	data-variant={variant}
	role={variant === "lens" ? "tablist" : "radiogroup"}
	aria-label={ariaLabel}
	{...variant === "lens"
		? // Tabs carry the roving tabindex themselves; a container tab-stop
			// would make the switcher cost two Tab presses to walk past.
			{}
		: { tabindex: 0 }}
	onkeydown={handleKeydown}
	class={cn(
		"relative inline-flex items-center gap-0.5 rounded-lg border p-0.5",
		"focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-2",
		variant === "lens"
			? // Recessed track: the well sits BELOW the surface so the active
				// segment reads as lifted out of it. No fixed height — the track
				// grows around the buttons so their touch target is never eaten
				// by the padding.
				"rounded-[14px] border-hairline bg-secondary p-1 text-sm"
			: "bg-muted/60 border-border/60 ring-foreground/5 ring-1",
		variant === "default" && (size === "sm" ? "h-7 text-xs" : "h-8 text-sm"),
		className
	)}
	{...restProps}
>
	{#each options as opt (opt.value)}
		{@const selected = opt.value === value}
		<button
			type="button"
			role={variant === "lens" ? "tab" : "radio"}
			aria-checked={variant === "lens" ? undefined : selected}
			aria-selected={variant === "lens" ? selected : undefined}
			aria-label={opt.label}
			disabled={opt.disabled}
			data-value={opt.value}
			data-state={selected ? "on" : "off"}
			tabindex={selected ? 0 : -1}
			onclick={() => handleClick(opt)}
			class={cn(
				"relative inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors",
				"focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
				variant === "lens"
					? "min-h-11 flex-1 rounded-[10px] px-4 md:min-h-10"
					: size === "sm"
						? "h-6 px-2"
						: "h-7 px-3",
				selected
					? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
					: "text-muted-foreground hover:text-foreground"
			)}
		>
			{#if opt.icon}{@render opt.icon(opt.value)}{/if}
			{opt.label}
		</button>
	{/each}
</div>

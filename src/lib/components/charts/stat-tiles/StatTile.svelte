<script lang="ts" module>
	import type { Snippet } from "svelte";

	export type StatTileChipVariant = "up" | "down" | "warn" | "crit" | "good" | "neutral";
	export interface StatTileChip {
		label: string;
		per?: string;
		variant: StatTileChipVariant;
	}
	export interface StatTileProps {
		label: string;
		href: string;
		ctaLabel: string;
		sub?: Snippet;
		chip?: StatTileChip;
		icon?: Snippet;
		value: Snippet;
		viz: Snippet;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * KPI stat tile shell (dataviz §6 stat-tiles-v8) — a link card with a fixed
	 * row skeleton (top · value · sub · viz · chip · cta) so a row of tiles
	 * aligns on one baseline. Each tile carries the mini-viz that fits its metric
	 * via the `viz` snippet.
	 */
	const chipTone: Record<StatTileChipVariant, string> = {
		up: "bg-type-einnahme-tint text-(--einnahme-strong)",
		down: "bg-type-ausgabe-tint text-(--ausgabe-text)",
		warn: "bg-severity-warn/12 text-(--warn-text)",
		crit: "bg-severity-critical/12 text-(--crit-text)",
		good: "bg-type-einnahme-tint text-(--einnahme-strong)",
		neutral: "bg-muted text-ink-700",
	};

	let { label, href, ctaLabel, sub, chip, icon, value, viz, class: className }: StatTileProps =
		$props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	data-slot="stat-tile"
	data-testid="stat-tile"
	{href}
	class={[
		"group relative flex flex-col rounded-2xl border bg-card p-[18px] pb-[15px] text-inherit no-underline shadow-(--shadow-card) transition-[transform,box-shadow] duration-150 hover:-translate-y-[3px] hover:shadow-(--shadow-lift) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
		className,
	]}
>
	<div class="mb-3 flex items-center gap-2.5">
		{#if icon}
			<span class="flex size-7 items-center justify-center rounded-lg bg-muted text-ink-500">{@render icon()}</span>
		{/if}
		<span class="text-[11.5px] font-bold uppercase tracking-[0.02em] text-ink-500">{label}</span>
		<svg class="ml-auto size-4 text-ink-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-primary-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="m9 18 6-6-6-6" />
		</svg>
	</div>

	<div class="whitespace-nowrap text-[29px] font-bold leading-[1.04] tracking-[-0.022em] text-ink-900">{@render value()}</div>

	{#if sub}
		<p class="mt-1.5 text-[11.5px] leading-snug text-ink-500">{@render sub()}</p>
	{/if}

	<div class="mt-3.5 flex min-h-0 flex-1 flex-col justify-center">{@render viz()}</div>

	{#if chip}
		<div class="mt-3.5 flex">
			<span class={["inline-flex items-center gap-1.5 rounded-full py-[3px] pl-[7px] pr-2.5 text-xs font-bold tabular-nums", chipTone[chip.variant]]}>
				<span>{chip.label}</span>
				{#if chip.per}<span class="font-semibold opacity-75">· {chip.per}</span>{/if}
			</span>
		</div>
	{/if}

	<div class="mt-3.5 flex items-center gap-1.5 border-t border-(--hairline) pt-3 text-[11.5px] font-bold text-ink-300">
		<span class="font-extrabold">→</span>
		{ctaLabel}
	</div>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->

<script lang="ts" module>
	import type { Snippet } from 'svelte';

	/**
	 * Format class of the rendered value. Strip discipline (spec §8) allows ONE
	 * class per strip — `data-format` makes that machine-checkable.
	 */
	export type StatCardFormat = 'money' | 'count' | 'ratio' | 'percent';

	export interface StatCardProps {
		/** Eyebrow label. WRAPS — never truncates (a clipped sphere name is a finding). */
		label: string;
		/**
		 * Pre-formatted value — the NUMBER ONLY. Never a label-in-value:
		 * "3 von 6", not "3 versandt". The label belongs in `label`/`sub`.
		 */
		value: string;
		/** Format class of `value` — one class per strip. */
		format: StatCardFormat;
		/**
		 * Identity hue as a CSS var string (type-/sphere token). Omitted ⇒ the
		 * neutral ink-300 dot. NEVER a status colour — status lives in `meta`.
		 */
		accent?: string;
		/** Context anchor under the value ("Buchungsjahr 2026"). */
		sub?: string;
		/** Status/delta slot — StatusPill, DeltaChip, a lock chip. */
		meta?: Snippet;
		/** Makes the whole card a link, usually to the matching filtered list. */
		href?: string;
		variant?: 'card' | 'bare';
		size?: 'md' | 'lg';
		/** Empty dignity: dims the value to ink-500. The dot stays. */
		empty?: boolean;
		class?: string;
		[key: `data-${string}`]: string | undefined;
	}
</script>

<script lang="ts">
	/**
	 * StatCard — THE static stat primitive (spec §8 T1, guidelines §2.6).
	 *
	 * Anatomy, in this order and never otherwise: accent dot (identity hue, or
	 * neutral) · eyebrow label · value (number only, tabular) · sub · meta slot.
	 * The hue rides the dot, never the number — a green amount would read as a
	 * status (ANDY-LENS §4).
	 *
	 * Use this for a static figure. A metric that carries a trend, a mini-viz or
	 * its own jump-off belongs in the dataviz `StatTile` instead (that family is
	 * locked). There is no third option: a local KPI tile is a drift finding.
	 */
	let {
		label,
		value,
		format,
		accent,
		sub,
		meta,
		href,
		variant = 'card',
		size = 'md',
		empty = false,
		class: className,
		...rest
	}: StatCardProps = $props();

	const SURFACE: Record<'card' | 'bare', string> = {
		card: 'rounded-xl border border-border bg-card p-4',
		bare: ''
	};

	const VALUE_SIZE: Record<'md' | 'lg', string> = {
		md: 'text-xl',
		lg: 'text-2xl tracking-[-0.02em]'
	};
</script>

<svelte:element
	this={href ? 'a' : 'div'}
	{...href ? { href } : {}}
	data-slot="stat-card"
	data-format={format}
	data-empty={empty ? '' : undefined}
	class={[
		'flex min-w-0 flex-col gap-1.5',
		SURFACE[variant],
		href &&
			'no-underline transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-input hover:shadow-(--shadow-lift) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
		className
	]}
	{...rest}
>
	<span class="flex items-start gap-2">
		<!-- Accent dot is ALWAYS present so the strip keeps one accent column. -->
		<span
			class={['mt-1 size-2 flex-none rounded-full', !accent && 'bg-ink-300']}
			style:background-color={accent}
			aria-hidden="true"
		></span>
		<span class="text-[11px] font-semibold uppercase leading-tight tracking-wider text-ink-500">
			{label}
		</span>
	</span>

	<span
		class={[
			'font-bold tabular-nums',
			VALUE_SIZE[size],
			empty ? 'text-ink-500' : 'text-ink-900'
		]}>{value}</span
	>

	{#if sub}
		<span class="text-[11px] tabular-nums text-ink-500">{sub}</span>
	{/if}

	{#if meta}
		<span class="mt-0.5 flex flex-wrap items-center gap-1.5">{@render meta()}</span>
	{/if}
</svelte:element>

<script lang="ts" module>
	import type { Snippet } from 'svelte';

	/**
	 * Layout axis (spec §8 rail coupling / AC19).
	 *
	 * - `horizontal` — the strip sits above its content at every width.
	 * - `rail` — horizontal up to the `rail` breakpoint (2240px), then a stacked
	 *   320px supporting pane beside the list (R6.3). SAME children, SAME DOM;
	 *   only this container's axis changes, which is what makes rail tiles and
	 *   strip tiles byte-identical.
	 */
	export type StatCardStripOrientation = 'horizontal' | 'rail';

	export interface StatCardStripProps {
		children: Snippet;
		orientation?: StatCardStripOrientation;
		/** Accessible name when the strip is a meaningful group. */
		label?: string;
		class?: string;
		[key: `data-${string}`]: string | undefined;
	}
</script>

<script lang="ts">
	/**
	 * StatCardStrip — the container that gives a row of StatCards its discipline
	 * (spec §8 T2): 2 columns on mobile, equal-width flex row from sm, and the
	 * R6.3 rail axis at ultra-wide.
	 *
	 * Strip grammar (enforced by tests/unit/stat-card-strip-grammar.test.ts):
	 * one format class per strip, subs all-or-none, the accent column always
	 * occupied. Mixing money and count tiles in one strip is a finding.
	 */
	let {
		children,
		orientation = 'horizontal',
		label,
		class: className,
		...rest
	}: StatCardStripProps = $props();

	// Two columns on mobile; from md an equal-width row that wraps once the
	// cards would fall below a readable 160px, so a 5-up strip degrades to 4+1
	// instead of five slivers. `rail` additionally flips to a column at 2240px.
	const BASE = 'grid grid-cols-2 gap-3 md:flex md:flex-wrap [&>*]:md:min-w-40 [&>*]:md:flex-1';

	const AXIS: Record<StatCardStripOrientation, string> = {
		horizontal: BASE,
		rail: `${BASE} rail:flex-col rail:[&>*]:flex-none`
	};
</script>

<div
	data-slot="stat-card-strip"
	data-orientation={orientation}
	aria-label={label}
	role={label ? 'group' : undefined}
	class={[AXIS[orientation], className]}
	{...rest}
>
	{@render children()}
</div>

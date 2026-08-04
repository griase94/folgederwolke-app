<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export interface ListRailLayoutProps {
		/** The KPI strip. Stacked above the list normally, docked right at ≥2240px. */
		aside: Snippet;
		/** The list itself (rows, empty state, pagination). */
		children: Snippet;
	}
</script>

<script lang="ts">
	/**
	 * ListRailLayout — the R6.3 ultra-wide composition for Art-Listen.
	 *
	 * Below the `rail` breakpoint (2240px) this is exactly today's page: KPI
	 * strip, then list. At and above it the strip docks as a sticky 320px
	 * supporting pane on the right (the M3 "supporting pane" pattern) and the
	 * list takes the freed height — so an ultra-wide display gains a screenful
	 * of list instead of showing the same narrow channel with more empty plain
	 * around it (Andys Regel 6).
	 *
	 * The strip is rendered ONCE and merely re-placed by the grid: no second DOM
	 * copy, so every selector keeps matching exactly one node, and rail tiles are
	 * byte-identical to strip tiles (spec §8 AC19).
	 *
	 * Pair with `<PageShell width="list" rail>`, which relaxes the 1100px cap to
	 * the ratified 1680px from the same breakpoint up so the pane has room.
	 */
	let { aside, children }: ListRailLayoutProps = $props();
</script>

<div
	data-slot="list-rail-layout"
	class="grid gap-5 rail:grid-cols-[minmax(0,1fr)_320px] rail:items-start rail:gap-8"
>
	<div class="min-w-0 rail:col-start-2 rail:row-start-1 rail:sticky rail:top-8 rail:self-start">
		{@render aside()}
	</div>
	<div class="min-w-0 rail:col-start-1 rail:row-start-1">
		{@render children()}
	</div>
</div>

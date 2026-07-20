<script lang="ts" module>
	import type { Snippet } from "svelte";
	export interface KpiStripProps {
		children: Snippet;
		class?: string;
		[key: `data-${string}`]: string | undefined;
		[key: `aria-${string}`]: string | undefined;
	}
</script>

<script lang="ts">
	/**
	 * KpiStrip — the responsive tile row for a type-list KPI header (plate
	 * transaktionen-v4 `.kpirow`): a 2-col grid on mobile that becomes an
	 * equal-width flex row on sm+ so 2–4 tiles fill the width without a stray
	 * empty cell. Layout only — the `kpi-strip` testid + any `data-slot` live on
	 * the caller's wrapper so a consumer (Einnahmen) can mark the sphere-split.
	 * Extra attributes spread onto the root.
	 */
	let { children, class: className, ...rest }: KpiStripProps = $props();
</script>

<div
	class={['grid grid-cols-2 gap-2.5 [&>*]:sm:flex-1 sm:flex sm:flex-wrap', className]}
	{...rest}
>
	{@render children()}
</div>

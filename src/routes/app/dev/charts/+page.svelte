<script lang="ts">
	/**
	 * Dataviz gallery (dev-only) — the standing visual tool for the chart family.
	 *
	 * The chart-heavy body lives in GalleryContent.svelte and is pulled via a
	 * dynamic import gated on `import.meta.env.DEV`. In a production build that
	 * constant folds to `false`, so Rollup dead-code-eliminates the import and
	 * none of the gallery-only chart components (Cashflow, Freigrenze, EÜR, …)
	 * ship in the client bundle. The route also 404s in prod via +page.ts, so
	 * this is defence in depth as much as a bundle diet. Keeping PageShell here
	 * satisfies the /app PageShell allowlist meta-test.
	 */
	import type { Component } from "svelte";
	import { onMount } from "svelte";
	import PageShell from "$lib/components/layout/PageShell.svelte";

	let Gallery = $state<Component | null>(null);

	onMount(async () => {
		if (import.meta.env.DEV) {
			Gallery = (await import("./GalleryContent.svelte")).default;
		}
	});
</script>

<svelte:head><title>Dataviz-Galerie · dev</title></svelte:head>

<PageShell width="full">
	<div>
		{#if Gallery}<Gallery />{/if}
	</div>
</PageShell>

<script lang="ts">
	/**
	 * Auslagen-kit gallery (dev-only) — every A-flow S1 composition primitive in
	 * its key states. The body lives in GalleryContent.svelte and is pulled via a
	 * DEV-gated dynamic import so the gallery-only components are dead-code
	 * eliminated from the production client bundle. +page.ts 404s the route
	 * outside dev. PageShell satisfies the /app PageShell allowlist meta-test.
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

<svelte:head><title>Auslagen-Kit-Galerie · dev</title></svelte:head>

<PageShell width="wide">
	<div>
		{#if Gallery}<Gallery />{/if}
	</div>
</PageShell>

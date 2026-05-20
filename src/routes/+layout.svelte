<script lang="ts">
	import '../app.css';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types.js';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
	// Favicon links live in src/app.html (PM-001 fix): a multi-format set
	// (favicon.svg + favicon-16.png + favicon-32.png + favicon.ico). We
	// deliberately do NOT import a logo asset here — the previous code
	// imported the Svelte default favicon, which leaked into every tab.
</script>

<svelte:head>
	{#if !data.publicFormEnabled}
		<meta name="robots" content="noindex,nofollow" />
	{/if}
</svelte:head>

{@render children()}

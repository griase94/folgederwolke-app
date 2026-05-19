<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types.js';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{#if !data.publicFormEnabled}
		<meta name="robots" content="noindex,nofollow" />
	{/if}
</svelte:head>

{@render children()}

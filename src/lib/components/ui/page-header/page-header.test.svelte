<script lang="ts">
	import PageHeader from "./page-header.svelte";

	let {
		heading,
		eyebrow,
		description,
		withActions = false,
	}: {
		heading: string;
		eyebrow?: string;
		description?: string;
		withActions?: boolean;
	} = $props();
</script>

<PageHeader {heading} {eyebrow} {description}>
	{#snippet actions()}
		{#if withActions}
			<button>Action Button</button>
		{/if}
	{/snippet}
</PageHeader>

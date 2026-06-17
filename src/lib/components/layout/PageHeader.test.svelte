<script lang="ts">
	import PageHeader from './PageHeader.svelte';

	let {
		title = 'Testseite',
		backHref = undefined,
		backLabel = undefined
	}: { title?: string; backHref?: string; backLabel?: string } = $props();
</script>

<PageHeader {title} {backHref} {backLabel}>
	{#snippet meta()}<span data-testid="meta-content">Meta-Zeile</span>{/snippet}
	{#snippet toolbar()}<button type="button" data-testid="toolbar-content">Filter</button>{/snippet}
</PageHeader>

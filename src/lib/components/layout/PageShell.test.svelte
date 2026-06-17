<script lang="ts">
	import PageShell from './PageShell.svelte';

	let { width = 'list' }: { width?: 'form' | 'list' | 'full' } = $props();
</script>

<PageShell {width}>
	<p data-testid="shell-content">Inhalt</p>
</PageShell>

<script lang="ts">
	import PageShell from './PageShell.svelte';

	let {
		width = 'list',
		rail = false
	}: { width?: 'form' | 'list' | 'wide'; rail?: boolean } = $props();
</script>

<PageShell {width} {rail}>
	<p data-testid="shell-content">Inhalt</p>
</PageShell>

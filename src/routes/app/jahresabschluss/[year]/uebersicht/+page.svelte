<script lang="ts">
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import UebersichtTab from '$lib/components/admin/jahresabschluss/UebersichtTab.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<PageShell width="list">
	<UebersichtTab {data} />
</PageShell>

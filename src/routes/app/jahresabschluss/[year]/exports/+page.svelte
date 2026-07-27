<script lang="ts">
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import ExportsTab from '$lib/components/admin/jahresabschluss/ExportsTab.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// hasBuchungen from the shared pre-flight (layout) — no extra query.
	const hasBuchungen = $derived(
		data.preFlight.items.find((i) => i.id === 'hasBuchungen')?.status === 'pass'
	);
</script>

<svelte:head>
	<title>Exports {data.year} – Jahresabschluss</title>
</svelte:head>

<PageShell width="list">
	<ExportsTab
		year={data.year}
		closed={data.closed}
		spendenCount={data.spendenCount}
		{hasBuchungen}
		manifest={data.manifest}
	/>
</PageShell>

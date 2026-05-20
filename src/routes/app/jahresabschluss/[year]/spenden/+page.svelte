<script lang="ts">
	import { EmptyState } from '$lib/components/ui/empty-state/index.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Spenden {data.year} – Jahresabschluss</title>
</svelte:head>

<EmptyState
	title={`Spenden ${data.year}`}
	description={`${data.spendenCount} Spende${data.spendenCount === 1 ? '' : 'n'} im Jahr. Listendarstellung folgt in Zyklus 5.`}
/>

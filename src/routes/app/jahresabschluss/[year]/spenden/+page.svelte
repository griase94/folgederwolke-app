<script lang="ts">
	import SpendenTab from '$lib/components/admin/jahresabschluss/SpendenTab.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<SpendenTab
	year={data.year}
	rows={data.rows}
	totals={data.totals}
	bescheinigungEnabled={data.bescheinigungEnabled}
	closed={data.closed}
/>

<script lang="ts">
	import BuchungslisteTab from '$lib/components/admin/jahresabschluss/BuchungslisteTab.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<BuchungslisteTab
	year={data.year}
	filters={data.filters}
	rows={data.rows}
	allRowsCount={data.allRowsCount}
/>

<script lang="ts">
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import BuchungslisteTab from '$lib/components/admin/jahresabschluss/BuchungslisteTab.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<PageShell width="list">
	<BuchungslisteTab
		year={data.year}
		filters={data.filters}
		rows={data.rows}
		allRowsCount={data.allRowsCount}
		kindCounts={data.kindCounts}
		ueberschussCents={data.eur.totalUeberschussCents}
		kategorien={data.kategorien}
		projects={data.projects}
		closed={data.closed}
	/>
</PageShell>

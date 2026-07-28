<script lang="ts">
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import UebersichtTab from '$lib/components/admin/jahresabschluss/UebersichtTab.svelte';
	import type { PageData } from './$types.js';

	// The bare /app/jahresabschluss/[year] URL renders the Übersicht inline so
	// existing deep-links keep working. Festschreibung lives at the Hub (D1a).
	let { data }: { data: PageData } = $props();
</script>

<PageShell width="list">
	<UebersichtTab {data} />
</PageShell>

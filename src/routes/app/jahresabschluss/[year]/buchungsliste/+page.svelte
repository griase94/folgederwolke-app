<script lang="ts">
	import { EmptyState } from '$lib/components/ui/empty-state/index.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Buchungsliste {data.year} – Jahresabschluss</title>
</svelte:head>

<EmptyState
	title={`Buchungsliste ${data.year}`}
	description="Wird im nächsten Build-Zyklus aktiviert. Bis dahin nutze die globale Transaktionsliste mit ?year-Filter."
/>

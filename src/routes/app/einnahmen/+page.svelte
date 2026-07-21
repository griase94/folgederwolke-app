<script lang="ts">
	/**
	 * /app/einnahmen — Einnahmen list. Thin host: owns the <title>; the list body
	 * lives in EinnahmenListView so /app/einnahmen/neu can render the same list as
	 * an inert Kulisse backdrop behind the entry dialog (byte-identical markup).
	 */
	import { page } from '$app/stores';
	import EinnahmenListView from './EinnahmenListView.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Einnahmen – {$page.data.vereinName}</title>
</svelte:head>

<EinnahmenListView {data} />

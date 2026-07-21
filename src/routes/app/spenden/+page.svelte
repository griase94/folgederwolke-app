<script lang="ts">
	/**
	 * /app/spenden — Spenden list. Thin host: owns the <title>; the list body lives
	 * in SpendenListView so /app/spenden/neu can render the same list as an inert
	 * Kulisse backdrop behind the entry dialog (byte-identical markup).
	 */
	import { page } from '$app/stores';
	import SpendenListView from './SpendenListView.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Spenden – {$page.data.vereinName}</title>
</svelte:head>

<SpendenListView {data} />

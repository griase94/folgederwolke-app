<script lang="ts">
	/**
	 * /app/ausgaben — Ausgaben list. Thin host: owns the <title>; the list body
	 * lives in AusgabenListView so /app/ausgaben/neu can render the same list as
	 * an inert Kulisse backdrop behind the entry dialog (byte-identical markup).
	 */
	import { page } from '$app/stores';
	import AusgabenListView from './AusgabenListView.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Ausgaben – {$page.data.vereinName}</title>
</svelte:head>

<AusgabenListView {data} />

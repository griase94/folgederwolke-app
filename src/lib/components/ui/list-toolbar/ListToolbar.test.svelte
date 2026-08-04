<script lang="ts">
	import ListToolbar, { TOOLBAR_BUTTON, TOOLBAR_PRIMARY } from './ListToolbar.svelte';

	let { hasChips = false, withMeta = false }: { hasChips?: boolean; withMeta?: boolean } =
		$props();
</script>

<ListToolbar {hasChips}>
	{#snippet leading()}
		<input type="search" aria-label="Suchen" class={TOOLBAR_BUTTON} />
		<button type="button" class={TOOLBAR_BUTTON}>+ Filter</button>
	{/snippet}
	{#if withMeta}
		{#snippet meta()}7 von 42{/snippet}
	{/if}
	{#snippet actions()}
		<a href="/export" class={TOOLBAR_BUTTON}>CSV</a>
		<a href="/neu" data-slot="new-cta" class={TOOLBAR_PRIMARY}>Neue Ausgabe</a>
	{/snippet}
	{#snippet chips()}
		<span data-slot="filter-chip">Status: Offen</span>
		<button type="button">Zurücksetzen</button>
	{/snippet}
</ListToolbar>

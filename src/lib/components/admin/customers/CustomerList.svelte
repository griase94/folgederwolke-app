<script lang="ts">
	import CustomerRow from './CustomerRow.svelte';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
	import SearchNoResults from '$lib/components/empty/SearchNoResults.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { CustomerView } from '$lib/server/domain/customers.js';

	let {
		customers,
		query = '',
		onEdit,
		onAdd,
		onClearSearch
	}: {
		customers: CustomerView[];
		/** Active search term — distinguishes "no data yet" from "no matches". */
		query?: string;
		onEdit: (c: CustomerView) => void;
		/** Optional CTA — when provided the empty state renders an "anlegen" button. */
		onAdd?: () => void;
		/** Clears the active search from the "Keine Treffer" state. */
		onClearSearch?: () => void;
	} = $props();

	const hasQuery = $derived(query.trim().length > 0);
</script>

{#if customers.length === 0 && hasQuery}
	<SearchNoResults {query} onClear={onClearSearch} />
{:else if customers.length === 0}
	<NoEntries entity="Kunden" hint="Lege den ersten Kunden an, um loszulegen.">
		{#snippet action()}
			{#if onAdd}
				<Button onclick={onAdd}>Kunden anlegen</Button>
			{/if}
		{/snippet}
	</NoEntries>
{:else}
	<div class="space-y-2" role="list" aria-label="Kundenliste">
		{#each customers as customer (customer.id)}
			<div role="listitem">
				<CustomerRow {customer} {onEdit} />
			</div>
		{/each}
	</div>
{/if}

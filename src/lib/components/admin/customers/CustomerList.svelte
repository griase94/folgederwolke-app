<script lang="ts">
	import CustomerRow from './CustomerRow.svelte';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
	import type { CustomerView } from '$lib/server/domain/customers.js';

	let {
		customers,
		onEdit
	}: {
		customers: CustomerView[];
		onEdit: (c: CustomerView) => void;
	} = $props();
</script>

{#if customers.length === 0}
	<NoEntries entity="Kunden" hint="Füge den ersten Kunden mit dem Button oben hinzu." />
{:else}
	<div class="space-y-2" role="list" aria-label="Kundenliste">
		{#each customers as customer (customer.id)}
			<div role="listitem">
				<CustomerRow {customer} {onEdit} />
			</div>
		{/each}
	</div>
{/if}

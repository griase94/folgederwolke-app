<script lang="ts">
	import CustomerRow from './CustomerRow.svelte';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { CustomerView } from '$lib/server/domain/customers.js';

	let {
		customers,
		onEdit,
		onAdd
	}: {
		customers: CustomerView[];
		onEdit: (c: CustomerView) => void;
		/** Optional CTA — when provided the empty state renders an "anlegen" button. */
		onAdd?: () => void;
	} = $props();
</script>

{#if customers.length === 0}
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

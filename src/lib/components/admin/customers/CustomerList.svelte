<script lang="ts">
	import CustomerRow from './CustomerRow.svelte';
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
	<div
		class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center"
	>
		<svg
			class="h-12 w-12 text-muted-foreground/50"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="1"
			aria-hidden="true"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
		</svg>
		<div>
			<p class="font-medium text-foreground">Noch keine Kunden</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Füge den ersten Kunden mit dem Button oben hinzu.
			</p>
		</div>
	</div>
{:else}
	<div class="space-y-2" role="list" aria-label="Kundenliste">
		{#each customers as customer (customer.id)}
			<div role="listitem">
				<CustomerRow {customer} {onEdit} />
			</div>
		{/each}
	</div>
{/if}

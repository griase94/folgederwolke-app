<!--
  InvoiceList - stacked list of invoices on /app/rechnungen.
  Empty state mirrors the CustomerList component for visual consistency.
-->
<script lang="ts">
	import InvoiceListRow from './InvoiceListRow.svelte';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
	import type { InvoiceRow } from '$lib/domain/invoices.js';

	let { invoices }: { invoices: InvoiceRow[] } = $props();
</script>

{#if invoices.length === 0}
	<NoEntries entity="Rechnungen" hint="Lege die erste Rechnung mit dem Button oben an." />
{:else}
	<div class="space-y-2" role="list" aria-label="Rechnungsliste">
		{#each invoices as invoice (invoice.id)}
			<div role="listitem">
				<InvoiceListRow {invoice} />
			</div>
		{/each}
	</div>
{/if}

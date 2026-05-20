<!--
  InvoiceList - stacked list of invoices on /app/rechnungen.
  Empty state shows a CTA linking to the "new invoice" route (UX-021).
-->
<script lang="ts">
	import InvoiceListRow from './InvoiceListRow.svelte';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { InvoiceRow } from '$lib/domain/invoices.js';

	let {
		invoices,
		newInvoiceHref = '/app/rechnungen/new'
	}: { invoices: InvoiceRow[]; newInvoiceHref?: string } = $props();
</script>

{#if invoices.length === 0}
	<NoEntries entity="Rechnungen" hint="Lege deine erste Rechnung an, um loszulegen.">
		{#snippet action()}
			<Button href={newInvoiceHref}>Rechnung anlegen</Button>
		{/snippet}
	</NoEntries>
{:else}
	<div class="space-y-2" role="list" aria-label="Rechnungsliste">
		{#each invoices as invoice (invoice.id)}
			<div role="listitem">
				<InvoiceListRow {invoice} />
			</div>
		{/each}
	</div>
{/if}

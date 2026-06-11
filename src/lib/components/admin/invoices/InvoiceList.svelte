<!--
  InvoiceList - stacked list of invoices on /app/rechnungen.
  Empty state shows a CTA linking to the "new invoice" route (UX-021).

  Mobile (< md): compact card via InvoiceCardMobile so businessId +
  pills don't crowd out the customer name at 390px (PM-009).
-->
<script lang="ts">
	import InvoiceListRow from './InvoiceListRow.svelte';
	import InvoiceCardMobile from './InvoiceCardMobile.svelte';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
	import SearchNoResults from '$lib/components/empty/SearchNoResults.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { InvoiceRow } from '$lib/domain/invoices.js';

	let {
		invoices,
		today,
		query = '',
		newInvoiceHref = '/app/rechnungen/new',
		onClearSearch
	}: {
		invoices: InvoiceRow[];
		today: string;
		/** Active search term — distinguishes "no data yet" from "no matches". */
		query?: string;
		newInvoiceHref?: string;
		onClearSearch?: () => void;
	} = $props();

	const hasQuery = $derived(query.trim().length > 0);
</script>

{#if invoices.length === 0 && hasQuery}
	<SearchNoResults {query} onClear={onClearSearch} />
{:else if invoices.length === 0}
	<NoEntries entity="Rechnungen" hint="Lege deine erste Rechnung an, um loszulegen.">
		{#snippet action()}
			<Button href={newInvoiceHref}>Rechnung anlegen</Button>
		{/snippet}
	</NoEntries>
{:else}
	<!-- Mobile (< md) card variant -->
	<div
		data-testid="invoice-card-list"
		class="space-y-2 md:hidden"
		role="list"
		aria-label="Rechnungsliste"
	>
		{#each invoices as invoice (invoice.id)}
			<div role="listitem">
				<InvoiceCardMobile {invoice} {today} />
			</div>
		{/each}
	</div>

	<!-- Desktop (md+) original row -->
	<div
		data-testid="invoice-row-list"
		class="hidden space-y-2 md:block"
		role="list"
		aria-label="Rechnungsliste"
	>
		{#each invoices as invoice (invoice.id)}
			<div role="listitem">
				<InvoiceListRow {invoice} {today} />
			</div>
		{/each}
	</div>
{/if}

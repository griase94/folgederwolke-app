<!--
  InvoiceList - stacked list of invoices on /app/rechnungen.
  Empty state shows a CTA linking to the "new invoice" route (UX-021).

  Mobile (< md): compact card via InvoiceCardMobile so businessId +
  pills don't crowd out the customer name at 390px (PM-009).
-->
<script lang="ts">
	import InvoiceListRow from './InvoiceListRow.svelte';
	import InvoiceCardMobile from './InvoiceCardMobile.svelte';
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
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<div
		data-testid="invoice-empty-state"
		class="grid place-items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center shadow-sm"
	>
		<div class="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-brand-soft text-primary-text" aria-hidden="true">
			<svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z" /><path stroke-linecap="round" stroke-linejoin="round" d="M14 2v4a2 2 0 002 2h4M10 9H8m8 4H8m8 4H8" /></svg>
		</div>
		<h3 class="text-base font-bold text-ink-900">Noch keine Rechnung gestellt — deine erste?</h3>
		<p class="mt-1.5 max-w-sm text-sm text-ink-500">Hier sammeln sich alle Rechnungen, die der Verein an Kund:innen stellt. Nummer, PDF und Buchung übernimmt folgederwolke für dich.</p>
		<Button href={newInvoiceHref} class="mt-5">Erste Rechnung anlegen</Button>
	</div>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
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

	<!-- Desktop (md+) — ONE ledger card with hairline-divided rows (house style) -->
	<div
		data-testid="invoice-row-list"
		class="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block"
	>
		<div class="divide-y divide-hairline" role="list" aria-label="Rechnungsliste">
			{#each invoices as invoice (invoice.id)}
				<div role="listitem">
					<InvoiceListRow {invoice} {today} />
				</div>
			{/each}
		</div>
	</div>
{/if}

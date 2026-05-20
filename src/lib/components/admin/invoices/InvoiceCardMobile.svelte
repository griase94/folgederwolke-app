<!--
  InvoiceCardMobile — compact card variant of InvoiceListRow for use below
  the md breakpoint (PM-009). The desktop row already wraps cleanly, but
  on a 390px screen the businessId + correction/festschreibung pills crowd
  out the customer name. This mobile card promotes Bezeichnung +
  customerName to the top line and demotes meta to a single secondary line.
-->
<script lang="ts">
	import InvoicePdfStatusBadge from './InvoicePdfStatusBadge.svelte';
	import { Money } from '$lib/components/ui/money/index.js';
	import type { InvoiceRow } from '$lib/domain/invoices.js';

	let { invoice }: { invoice: InvoiceRow } = $props();

	const isSuperseded = $derived(invoice.supersededByBusinessId !== null);
	const isCorrection = $derived(invoice.supersedesId !== null);

	const datumFmt = $derived.by(() => {
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(invoice.rechnungsdatum);
		return m ? `${m[3]}.${m[2]}.${m[1]}` : invoice.rechnungsdatum;
	});

	const rowOpacity = $derived(isSuperseded ? 'opacity-60' : '');
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	href="/app/rechnungen/{invoice.id}"
	data-testid="invoice-card"
	class="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {rowOpacity}"
>
	<div
		class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-800"
		aria-hidden="true"
	>
		<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m-7 5h8a2 2 0 002-2V7a2 2 0 00-2-2h-3.586a1 1 0 01-.707-.293L11 3H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
		</svg>
	</div>

	<div class="min-w-0 flex-1">
		<p class="truncate text-sm font-medium text-foreground">{invoice.bezeichnung}</p>
		<p class="truncate text-xs text-muted-foreground">{invoice.customerName}</p>
		<div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
			<span class="font-mono text-[10px]">{invoice.businessId}</span>
			<span aria-hidden="true">·</span>
			<span>{datumFmt}</span>
			{#if isCorrection}
				<span class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0 text-[10px] font-medium text-blue-700">Korrektur</span>
			{/if}
			{#if invoice.festgeschriebenAt}
				<span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-700">festgeschrieben</span>
			{/if}
			<InvoicePdfStatusBadge
				pdfStatus={invoice.pdfStatus}
				driveStatus={invoice.driveStatus}
				showDrive={false}
			/>
		</div>
	</div>

	<div class="shrink-0 text-right">
		<Money valueInCents={invoice.bruttoCents} class="text-sm" />
	</div>
</a>

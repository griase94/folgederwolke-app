<!--
  InvoiceListRow - single invoice row on /app/rechnungen.
  Mirrors the rosa-themed CustomerRow look + invoice-specific meta.
-->
<script lang="ts">
	import InvoicePdfStatusBadge from './InvoicePdfStatusBadge.svelte';
	import type { InvoiceRow } from '$lib/domain/invoices.js';

	let { invoice }: { invoice: InvoiceRow } = $props();

	const isSuperseded = $derived(invoice.supersededByBusinessId !== null);
	const isCorrection = $derived(invoice.supersedesId !== null);

	const bruttoFmt = $derived(
		(invoice.bruttoCents / 100).toLocaleString('de-DE', {
			style: 'currency',
			currency: invoice.currency,
			minimumFractionDigits: 2
		})
	);

	const datumFmt = $derived.by(() => {
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(invoice.rechnungsdatum);
		return m ? `${m[3]}.${m[2]}.${m[1]}` : invoice.rechnungsdatum;
	});

	const rowOpacity = $derived(isSuperseded ? 'opacity-60' : '');
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	href="/app/rechnungen/{invoice.id}"
	class="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {rowOpacity}"
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
		<div class="flex items-center gap-2">
			<span class="font-mono text-sm font-semibold text-foreground">{invoice.businessId}</span>
			{#if isCorrection}
				<span class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Korrektur</span>
			{/if}
			{#if invoice.festgeschriebenAt}
				<span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">festgeschrieben</span>
			{/if}
			{#if isSuperseded}
				<span class="inline-flex items-center rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">ersetzt durch {invoice.supersededByBusinessId}</span>
			{/if}
		</div>
		<div class="mt-0.5 truncate text-sm text-foreground">
			<span class="font-medium">{invoice.bezeichnung}</span>
			<span class="text-muted-foreground"> · {invoice.customerName}</span>
		</div>
		<div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
			<span>{datumFmt}</span>
			<InvoicePdfStatusBadge
				pdfStatus={invoice.pdfStatus}
				driveStatus={invoice.driveStatus}
				showDrive
			/>
		</div>
	</div>

	<div class="shrink-0 text-right">
		<div class="font-semibold tabular-nums text-foreground">{bruttoFmt}</div>
	</div>
</a>

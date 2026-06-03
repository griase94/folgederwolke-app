<!--
  InvoiceListRow - single invoice row on /app/rechnungen.

  Layout (P12-D):
    [icon] [main info (a -> detail page)] [brutto] [status pills] [kebab]

  The whole row is no longer a single <a>: the kebab needs to be a first-class
  button, and the inline mark-paid expansion below the row must not be inside
  the navigation link. Pattern mirrors TransactionRow.svelte (action chip
  outside the link).

  Kebab actions (gated by state):
    - "Bearbeiten"            -> /app/rechnungen/[id]/edit (editable only)
    - "Als bezahlt markieren" -> expands inline panel (payable only)
    - "Details oeffnen"        -> /app/rechnungen/[id] (always)
    - "PDF herunterladen"     -> /app/rechnungen/[id]/pdf (when pdfFileId)

  Editable iff: bezahltAm IS NULL AND festgeschriebenAt IS NULL AND not superseded.
  Payable: same gate (markInvoiceAsPaid will re-check on submit).
-->
<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import InvoicePdfStatusBadge from './InvoicePdfStatusBadge.svelte';
	import InvoiceMarkPaidRow from './InvoiceMarkPaidRow.svelte';
	import type { InvoiceRow } from '$lib/domain/invoices.js';

	let { invoice, today }: { invoice: InvoiceRow; today: string } = $props();

	const isSuperseded = $derived(invoice.supersededByBusinessId !== null);
	const isCorrection = $derived(invoice.supersedesId !== null);
	const isFestgeschrieben = $derived(invoice.festgeschriebenAt !== null);
	const isPaid = $derived(invoice.bezahltAm !== null);

	const editable = $derived(!isPaid && !isFestgeschrieben && !isSuperseded);
	const payable = $derived(editable);

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

	const bezahltFmt = $derived.by(() => {
		if (!invoice.bezahltAm) return null;
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(invoice.bezahltAm);
		return m ? `${m[3]}.${m[2]}.${m[1]}` : invoice.bezahltAm;
	});

	const rowOpacity = $derived(isSuperseded ? 'opacity-60' : '');

	let dropdownOpen = $state(false);
	let markPaidOpen = $state(false);

	function openMarkPaid(): void {
		markPaidOpen = true;
		dropdownOpen = false;
	}

	function closeMarkPaid(): void {
		markPaidOpen = false;
	}
</script>

<div class="space-y-2">
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<div
		class="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md {rowOpacity}"
		data-testid="invoice-row"
		data-invoice-id={invoice.id}
	>
		<a
			href="/app/rechnungen/{invoice.id}"
			class="flex min-w-0 flex-1 items-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
		>
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-800"
				aria-hidden="true"
			>
				<svg
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9 12h6m-6 4h6m-7 5h8a2 2 0 002-2V7a2 2 0 00-2-2h-3.586a1 1 0 01-.707-.293L11 3H5a2 2 0 00-2 2v14a2 2 0 002 2z"
					/>
				</svg>
			</div>

			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-2">
					<span class="font-mono text-sm font-semibold text-foreground">{invoice.businessId}</span>
					{#if isCorrection}
						<span
							class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
							>Korrektur</span
						>
					{/if}
					{#if isFestgeschrieben}
						<span
							class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
							>festgeschrieben</span
						>
					{/if}
					{#if isSuperseded}
						<span
							class="inline-flex items-center rounded-full border border-muted-foreground/30 bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
							>ersetzt durch {invoice.supersededByBusinessId}</span
						>
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
						hasFile={invoice.pdfFileId !== null}
					/>
					{#if isPaid && bezahltFmt}
						<span
							class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
							data-testid="invoice-paid-badge"
						>
							bezahlt · {bezahltFmt}
						</span>
					{/if}
				</div>
			</div>
		</a>

		<div class="flex shrink-0 items-center gap-2">
			<div class="text-right">
				<div class="font-semibold tabular-nums text-foreground">{bruttoFmt}</div>
			</div>

			<DropdownMenu.Root bind:open={dropdownOpen}>
				<DropdownMenu.Trigger
					aria-label="Aktionen für {invoice.businessId}"
					class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					data-testid="invoice-row-kebab"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
						<circle cx="12" cy="5" r="1.5" />
						<circle cx="12" cy="12" r="1.5" />
						<circle cx="12" cy="19" r="1.5" />
					</svg>
				</DropdownMenu.Trigger>

				<DropdownMenu.Content align="end" class="w-52">
					{#if editable}
						<DropdownMenu.Item
							onSelect={() => {
								dropdownOpen = false;
							}}
						>
							<a
								href="/app/rechnungen/{invoice.id}/edit"
								class="flex w-full items-center gap-2"
								data-testid="invoice-row-edit"
							>
								<svg
									class="h-4 w-4 text-muted-foreground"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
									/>
								</svg>
								Bearbeiten
							</a>
						</DropdownMenu.Item>
					{/if}
					{#if payable}
						<DropdownMenu.Item
							onSelect={() => openMarkPaid()}
							data-testid="invoice-row-mark-paid"
						>
							<svg
								class="h-4 w-4 text-muted-foreground"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M5 13l4 4L19 7"
								/>
							</svg>
							Als bezahlt markieren
						</DropdownMenu.Item>
					{/if}
					<DropdownMenu.Item
						onSelect={() => {
							dropdownOpen = false;
						}}
					>
						<a
							href="/app/rechnungen/{invoice.id}"
							class="flex w-full items-center gap-2"
							data-testid="invoice-row-open"
						>
							<svg
								class="h-4 w-4 text-muted-foreground"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
								/>
							</svg>
							Details öffnen
						</a>
					</DropdownMenu.Item>
					{#if invoice.pdfFileId !== null}
						<DropdownMenu.Item
							onSelect={() => {
								dropdownOpen = false;
							}}
						>
							<a
								href="/app/rechnungen/{invoice.id}/pdf"
								class="flex w-full items-center gap-2"
								data-testid="invoice-row-pdf"
							>
								<svg
									class="h-4 w-4 text-muted-foreground"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
									/>
								</svg>
								PDF herunterladen
							</a>
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	{#if markPaidOpen}
		<InvoiceMarkPaidRow
			invoiceId={invoice.id}
			businessId={invoice.businessId}
			customerName={invoice.customerName}
			bezeichnung={invoice.bezeichnung}
			bruttoCents={invoice.bruttoCents}
			rechnungsdatum={invoice.rechnungsdatum}
			actionUrl="/app/rechnungen?/mark-paid"
			{today}
			onCancel={closeMarkPaid}
		/>
	{/if}
</div>

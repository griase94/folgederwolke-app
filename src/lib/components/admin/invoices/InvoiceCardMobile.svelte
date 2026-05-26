<!--
  InvoiceCardMobile - compact card variant of InvoiceListRow for use below
  the md breakpoint (PM-009). The desktop row already wraps cleanly, but
  on a 390px screen the businessId + correction/festschreibung pills crowd
  out the customer name. This mobile card promotes Bezeichnung +
  customerName to the top line and demotes meta to a single secondary line.

  P12-D: drop wrapping link, add kebab + paid badge + inline mark-paid
  expansion below the card. Same gating as InvoiceListRow.
-->
<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import InvoicePdfStatusBadge from './InvoicePdfStatusBadge.svelte';
	import InvoiceMarkPaidRow from './InvoiceMarkPaidRow.svelte';
	import { Money } from '$lib/components/ui/money/index.js';
	import type { InvoiceRow } from '$lib/domain/invoices.js';

	let { invoice, today }: { invoice: InvoiceRow; today: string } = $props();

	const isSuperseded = $derived(invoice.supersededByBusinessId !== null);
	const isCorrection = $derived(invoice.supersedesId !== null);
	const isFestgeschrieben = $derived(invoice.festgeschriebenAt !== null);
	const isPaid = $derived(invoice.bezahltAm !== null);

	const editable = $derived(!isPaid && !isFestgeschrieben && !isSuperseded);
	const payable = $derived(editable);

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
		data-testid="invoice-card"
		data-invoice-id={invoice.id}
		class="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm transition-shadow {rowOpacity}"
	>
		<a
			href="/app/rechnungen/{invoice.id}"
			class="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
		>
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-800"
				aria-hidden="true"
			>
				<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9 12h6m-6 4h6m-7 5h8a2 2 0 002-2V7a2 2 0 00-2-2h-3.586a1 1 0 01-.707-.293L11 3H5a2 2 0 00-2 2v14a2 2 0 002 2z"
					/>
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
						<span
							class="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0 text-[10px] font-medium text-blue-700"
							>Korrektur</span
						>
					{/if}
					{#if isFestgeschrieben}
						<span
							class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-700"
							>festgeschrieben</span
						>
					{/if}
					<InvoicePdfStatusBadge
						pdfStatus={invoice.pdfStatus}
						hasFile={invoice.pdfFileId !== null}
					/>
					{#if isPaid && bezahltFmt}
						<span
							class="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] font-medium text-emerald-700"
							data-testid="invoice-paid-badge"
						>
							bezahlt · {bezahltFmt}
						</span>
					{/if}
				</div>
			</div>
		</a>

		<div class="flex shrink-0 items-center gap-1.5">
			<Money valueInCents={invoice.bruttoCents} class="text-sm" />

			<DropdownMenu.Root bind:open={dropdownOpen}>
				<DropdownMenu.Trigger
					aria-label="Aktionen für {invoice.businessId}"
					class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					data-testid="invoice-card-kebab"
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
								data-testid="invoice-card-edit"
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
							data-testid="invoice-card-mark-paid"
						>
							<svg
								class="h-4 w-4 text-muted-foreground"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
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
							data-testid="invoice-card-open"
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
								data-testid="invoice-card-pdf"
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

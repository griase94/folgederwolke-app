<!--
  InvoiceCardMobile — stacked card variant of InvoiceListRow below md
  (rechnungen-suite-v2 mobile). Customer title full-width on top, id-chip +
  Bezeichnung as a secondary line, Betrag (grün) + Status-Chip at the bottom.
  The kebab sits as a real button over the stretched tap-link. Same status
  doctrine + gating as the desktop row.
-->
<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import InvoiceMarkPaidRow from './InvoiceMarkPaidRow.svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { deriveInvoiceStatus } from '$lib/domain/invoices.js';
	import type { InvoiceRow } from '$lib/domain/invoices.js';

	let { invoice, today }: { invoice: InvoiceRow; today: string } = $props();

	const isSuperseded = $derived(invoice.supersededByBusinessId !== null);
	const isCorrection = $derived(invoice.supersedesId !== null);
	const isFestgeschrieben = $derived(invoice.festgeschriebenAt !== null);
	const isPaid = $derived(invoice.bezahltAm !== null);

	const editable = $derived(!isPaid && !isFestgeschrieben && !isSuperseded);
	const payable = $derived(editable);

	const status = $derived(
		deriveInvoiceStatus(invoice.bezahltAm, invoice.faelligkeitsDatum, today)
	);

	const overdueDays = $derived.by(() => {
		if (status !== 'überfällig' || !invoice.faelligkeitsDatum) return 0;
		const due = Date.parse(invoice.faelligkeitsDatum + 'T00:00:00Z');
		const now = Date.parse(today + 'T00:00:00Z');
		return Math.max(0, Math.round((now - due) / 86_400_000));
	});

	const rowOpacity = $derived(isSuperseded ? 'opacity-60' : '');

	let dropdownOpen = $state(false);
	let markPaidOpen = $state(false);
</script>

<div class="space-y-0" data-invoice-id={invoice.id}>
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<div
		data-testid="invoice-card"
		class="group relative rounded-xl border border-border bg-card px-3.5 py-3 pr-12 shadow-sm {rowOpacity} {markPaidOpen ? 'rounded-b-none' : ''}"
	>
		<a
			href="/app/rechnungen/{invoice.id}"
			class="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label="{invoice.businessId} öffnen"
		></a>

		<div class="pointer-events-none relative z-[1] min-w-0">
			<p class="truncate text-[15px] font-semibold leading-tight text-ink-900">{invoice.customerName}</p>
			<div class="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-500">
				<span class="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-700">{invoice.businessId}</span>
				<span class="min-w-0 truncate">{invoice.bezeichnung}</span>
				{#if isCorrection}
					<span class="rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0 text-[10px] font-semibold text-primary-text">Korrektur</span>
				{/if}
			</div>
			<div class="mt-2.5 flex items-center justify-between gap-3">
				<span class="text-[15px] font-bold tabular-nums text-type-einnahme">{formatMoney(invoice.bruttoCents)}</span>
				{#if status === 'bezahlt'}
					<span class="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" data-testid="invoice-paid-badge">bezahlt</span>
				{:else if status === 'überfällig'}
					<span class="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">überfällig · {overdueDays} {overdueDays === 1 ? 'Tag' : 'Tage'}</span>
				{:else}
					<span class="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-ink-500">offen</span>
				{/if}
			</div>
		</div>

		<!-- kebab -->
		<div class="absolute right-2 top-1/2 z-20 -translate-y-1/2">
			<DropdownMenu.Root bind:open={dropdownOpen}>
				<DropdownMenu.Trigger
					aria-label="Aktionen für {invoice.businessId}"
					data-testid="invoice-card-kebab"
					class="grid h-9 w-9 place-items-center rounded-lg text-ink-300 transition-colors hover:bg-secondary hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<svg class="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-52">
					<DropdownMenu.Item onSelect={() => (dropdownOpen = false)}>
						<a href="/app/rechnungen/{invoice.id}" class="flex w-full items-center gap-2" data-testid="invoice-card-open">
							<svg class="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.06 12.35a1 1 0 010-.7 10.75 10.75 0 0119.88 0 1 1 0 010 .7 10.75 10.75 0 01-19.88 0z" /><circle cx="12" cy="12" r="3" /></svg>
							Ansehen
						</a>
					</DropdownMenu.Item>
					{#if editable}
						<DropdownMenu.Item onSelect={() => (dropdownOpen = false)}>
							<a href="/app/rechnungen/{invoice.id}/edit" class="flex w-full items-center gap-2" data-testid="invoice-card-edit">
								<svg class="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
								Bearbeiten
							</a>
						</DropdownMenu.Item>
					{/if}
					{#if payable}
						<DropdownMenu.Item
							onSelect={() => {
								markPaidOpen = true;
								dropdownOpen = false;
							}}
							data-testid="invoice-card-mark-paid"
						>
							<svg class="h-4 w-4 text-type-einnahme" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
							Als bezahlt markieren
						</DropdownMenu.Item>
					{/if}
					{#if invoice.pdfFileId !== null}
						<DropdownMenu.Item onSelect={() => (dropdownOpen = false)}>
							<a href="/app/rechnungen/{invoice.id}/pdf" class="flex w-full items-center gap-2" data-testid="invoice-card-pdf">
								<svg class="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
								PDF herunterladen
							</a>
						</DropdownMenu.Item>
					{/if}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->

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
			onCancel={() => (markPaidOpen = false)}
		/>
	{/if}
</div>

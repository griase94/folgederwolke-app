<!--
  InvoiceListRow — one invoice line on /app/rechnungen (rechnungen-suite-v2).

  Plate anatomy: [glyph] [customer + id-chip·Bezeichnung] [Datum] [Betrag grün]
  [Status-Chip auf fester Spalte] [chevron] [kebab]. Rechnungen sind Einnahmen
  → grün; „offen" neutral (nie amber), „überfällig" amber, „bezahlt" grün.
  Status is derived (bezahltAm + faelligkeitsDatum), never stored.

  The whole row is a stretched link to the detail; the kebab is the one control
  that overrides it. The inline mark-paid panel expands under the row.
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

	// Days overdue = today − Fälligkeitsdatum (both Berlin-ISO YYYY-MM-DD).
	const overdueDays = $derived.by(() => {
		if (status !== 'überfällig' || !invoice.faelligkeitsDatum) return 0;
		const due = Date.parse(invoice.faelligkeitsDatum + 'T00:00:00Z');
		const now = Date.parse(today + 'T00:00:00Z');
		return Math.max(0, Math.round((now - due) / 86_400_000));
	});

	const datumFmt = $derived.by(() => {
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(invoice.rechnungsdatum);
		return m ? `${m[3]}.${m[2]}.` : invoice.rechnungsdatum;
	});

	const rowOpacity = $derived(isSuperseded ? 'opacity-60' : '');

	let dropdownOpen = $state(false);
	let markPaidOpen = $state(false);
</script>

<div class="space-y-0" data-invoice-id={invoice.id}>
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<div
		class="group relative flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40 {rowOpacity}"
		data-testid="invoice-row"
		class:z-10={dropdownOpen}
	>
		<a
			href="/app/rechnungen/{invoice.id}"
			class="absolute inset-0 z-0 focus-visible:outline-none focus-visible:-outline-offset-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
			aria-label="{invoice.businessId} öffnen"
		></a>

		<!-- glyph (Einnahme = grün) -->
		<span class="pointer-events-none relative z-[1] grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-type-einnahme-tint text-type-einnahme" aria-hidden="true">
			<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z" /><path stroke-linecap="round" stroke-linejoin="round" d="M14 2v4a2 2 0 002 2h4M10 9H8m8 4H8m8 4H8" /></svg>
		</span>

		<!-- main: customer + id-chip · Bezeichnung -->
		<div class="pointer-events-none relative z-[1] min-w-0 flex-1">
			<div class="truncate text-[15px] font-semibold leading-tight text-ink-900">
				<span class="underline decoration-transparent decoration-2 underline-offset-2 transition-colors group-hover:text-primary-text group-hover:decoration-current">{invoice.customerName}</span>
			</div>
			<div class="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-500">
				<span class="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-700">{invoice.businessId}</span>
				<span class="min-w-0 truncate">{invoice.bezeichnung}</span>
				{#if isCorrection}
					<span class="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-semibold text-primary-text">Korrektur</span>
				{/if}
				{#if isSuperseded}
					<span class="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-semibold text-ink-500">ersetzt durch {invoice.supersededByBusinessId}</span>
				{/if}
			</div>
		</div>

		<!-- Datum -->
		<div class="pointer-events-none relative z-[1] hidden w-14 shrink-0 text-right text-[13px] tabular-nums text-ink-500 sm:block">{datumFmt}</div>

		<!-- Betrag (Einnahme = grün, ein Lineal) -->
		<div class="pointer-events-none relative z-[1] w-[92px] shrink-0 text-right text-[15px] font-bold tabular-nums text-type-einnahme">{formatMoney(invoice.bruttoCents)}</div>

		<!-- Status-Chip auf fester Spalte -->
		<div class="pointer-events-none relative z-[1] hidden w-[168px] shrink-0 justify-start sm:flex">
			{#if status === 'bezahlt'}
				<span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" data-testid="invoice-paid-badge">
					<svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4" /></svg>
					bezahlt
				</span>
			{:else if status === 'überfällig'}
				<span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
					<svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01" /></svg>
					überfällig · {overdueDays} {overdueDays === 1 ? 'Tag' : 'Tage'}
				</span>
			{:else}
				<span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-ink-500">
					<svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6l4 2" /></svg>
					offen
				</span>
			{/if}
		</div>

		<!-- chevron -->
		<span class="pointer-events-none relative z-[1] hidden shrink-0 place-items-center text-ink-300 opacity-60 transition-[opacity,transform,color] group-hover:translate-x-0.5 group-hover:text-primary-text group-hover:opacity-100 sm:grid" aria-hidden="true">
			<svg class="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6" /></svg>
		</span>

		<!-- kebab -->
		<DropdownMenu.Root bind:open={dropdownOpen}>
			<DropdownMenu.Trigger
				aria-label="Aktionen für {invoice.businessId}"
				data-testid="invoice-row-kebab"
				class="pointer-events-auto relative z-20 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-300 transition-colors hover:bg-secondary hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<svg class="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="w-52">
				<DropdownMenu.Item onSelect={() => (dropdownOpen = false)}>
					<a href="/app/rechnungen/{invoice.id}" class="flex w-full items-center gap-2" data-testid="invoice-row-open">
						<svg class="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.06 12.35a1 1 0 010-.7 10.75 10.75 0 0119.88 0 1 1 0 010 .7 10.75 10.75 0 01-19.88 0z" /><circle cx="12" cy="12" r="3" /></svg>
						Ansehen
					</a>
				</DropdownMenu.Item>
				{#if editable}
					<DropdownMenu.Item onSelect={() => (dropdownOpen = false)}>
						<a href="/app/rechnungen/{invoice.id}/edit" class="flex w-full items-center gap-2" data-testid="invoice-row-edit">
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
						data-testid="invoice-row-mark-paid"
					>
						<svg class="h-4 w-4 text-type-einnahme" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
						Als bezahlt markieren
					</DropdownMenu.Item>
				{/if}
				{#if invoice.pdfFileId !== null}
					<DropdownMenu.Item onSelect={() => (dropdownOpen = false)}>
						<a href="/app/rechnungen/{invoice.id}/pdf" class="flex w-full items-center gap-2" data-testid="invoice-row-pdf">
							<svg class="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>
							PDF herunterladen
						</a>
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
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

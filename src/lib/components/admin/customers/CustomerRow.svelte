<!--
	CustomerRow — one Kunde line (kunden-v5 plate anatomy).

	A neutral Ink object: initials avatar (no money type-colour), name + Ort/
	E-Mail subline, and a right-hand "Offen an uns" fact on ONE ruler —
	offen amount in open-ink, "alles bezahlt" green, or a quiet "keine
	Rechnungen" when the customer has no invoices at all. The whole row is a
	stretched link to the detail; the kebab is the one control that overrides
	it (Ansehen / Bearbeiten / Archivieren — archived rows: Ansehen /
	Wiederherstellen, never Bearbeiten [F7]).
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import type { CustomerListView } from '$lib/server/domain/customers.js';
	import { deriveOrt } from '$lib/domain/customers.js';

	let {
		customer,
		onEdit,
		onArchive,
		onRestore
	}: {
		customer: CustomerListView;
		onEdit: (c: CustomerListView) => void;
		onArchive: (c: CustomerListView) => void;
		onRestore: (c: CustomerListView) => void;
	} = $props();

	let menuOpen = $state(false);

	const isArchived = $derived(!!customer.deletedAt);
	const href = $derived(`/app/kunden/${customer.id}`);

	const initials = $derived(
		customer.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0])
			.join('')
			.toUpperCase() || '?'
	);

	const ort = $derived(deriveOrt(customer.addressBlock));
	const subline = $derived(ort ?? customer.email ?? null);
	/** null → italic placeholder; distinguishes "no address" from "no email". */
	const sublineIsEmail = $derived(!ort && !!customer.email);

	function view() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(href);
	}
</script>

<div
	class="group relative grid grid-cols-[44px_minmax(0,1fr)_auto_36px] items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-[box-shadow,transform,border-color] hover:-translate-y-px hover:border-input hover:shadow-md sm:grid-cols-[44px_minmax(0,1fr)_auto_20px_36px] sm:gap-4"
	data-testid="customer-row"
	data-customer-id={customer.id}
	class:z-10={menuOpen}
>
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a href={href} class="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label="{customer.name} öffnen"></a>

	<!-- avatar (neutral) -->
	<div
		class="pointer-events-none relative z-[1] grid h-11 w-11 place-items-center rounded-full bg-secondary text-sm font-bold text-ink-700 {isArchived ? 'opacity-60' : ''}"
		aria-hidden="true"
	>
		{initials}
	</div>

	<!-- identity -->
	<div class="pointer-events-none relative z-[1] min-w-0 {isArchived ? 'opacity-60' : ''}">
		<div class="text-[15px] font-semibold leading-tight text-ink-900">
			<span class="underline decoration-transparent decoration-2 underline-offset-2 transition-colors group-hover:decoration-current group-hover:text-primary-text">{customer.name}</span>
			{#if isArchived}
				<span class="ml-2 inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 align-middle text-[11px] font-semibold text-ink-500">archiviert</span>
			{/if}
		</div>
		<div class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-ink-500">
			{#if ort}
				<svg class="h-4 w-4 shrink-0 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 01-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0116 0z" /><circle cx="12" cy="10" r="3" /></svg>
			{:else if sublineIsEmail}
				<svg class="h-4 w-4 shrink-0 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l9 6 9-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
			{/if}
			{#if subline}
				<span class="truncate">{subline}</span>
			{:else}
				<span class="truncate italic text-ink-300">keine Adresse hinterlegt</span>
			{/if}
		</div>
	</div>

	<!-- Offen-an-uns fact (right ruler) -->
	<div class="pointer-events-none relative z-[1] flex min-w-[92px] flex-col items-end gap-0.5 {isArchived ? 'opacity-60' : ''}">
		{#if customer.invoiceCount === 0}
			<span class="text-[13px] font-medium text-ink-500">keine Rechnungen</span>
		{:else if customer.offenCents > 0}
			<span class="text-[10px] font-bold uppercase leading-none tracking-wider text-ink-300">offen</span>
			<span class="text-[15px] font-bold leading-none text-open-ink tabular-nums">{formatMoney(customer.offenCents)}</span>
		{:else}
			<span class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-type-einnahme">
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M20 6L9 17l-5-5" /></svg>
				alles bezahlt
			</span>
		{/if}
	</div>

	<!-- persistent disclosure cue (desktop) -->
	<span class="pointer-events-none relative z-[1] hidden place-items-center text-ink-300 opacity-60 transition-[opacity,transform,color] group-hover:translate-x-0.5 group-hover:text-primary-text group-hover:opacity-100 sm:grid {isArchived ? 'opacity-40' : ''}" aria-hidden="true">
		<svg class="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6" /></svg>
	</span>

	<!-- kebab -->
	<DropdownMenu.Root bind:open={menuOpen}>
		<DropdownMenu.Trigger
			aria-label="Aktionen für {customer.name}"
			class="pointer-events-auto relative z-20 grid h-9 w-9 place-items-center justify-self-end rounded-lg text-ink-300 transition-colors hover:bg-secondary hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<svg class="h-[18px] w-[18px]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-48">
			<DropdownMenu.Item onSelect={view}>
				<svg class="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.06 12.35a1 1 0 010-.7 10.75 10.75 0 0119.88 0 1 1 0 010 .7 10.75 10.75 0 01-19.88 0z" /><circle cx="12" cy="12" r="3" /></svg>
				Ansehen
			</DropdownMenu.Item>
			{#if isArchived}
				<DropdownMenu.Item onSelect={() => onRestore(customer)}>
					<svg class="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8m0-5v5h5" /></svg>
					Wiederherstellen
				</DropdownMenu.Item>
			{:else}
				<DropdownMenu.Item onSelect={() => onEdit(customer)}>
					<svg class="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
					Bearbeiten
				</DropdownMenu.Item>
				{#if !customer.isFixture}
					<DropdownMenu.Item
						class="text-severity-critical-text data-highlighted:bg-severity-critical/10 data-highlighted:text-severity-critical-text"
						onSelect={() => onArchive(customer)}
					>
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect width="20" height="5" x="2" y="3" rx="1" /><path stroke-linecap="round" stroke-linejoin="round" d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8M10 12h4" /></svg>
						Archivieren
					</DropdownMenu.Item>
				{/if}
			{/if}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

<script lang="ts">
	import { page } from '$app/state';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import InvoiceForm from '$lib/components/admin/invoices/InvoiceForm.svelte';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const errors = $derived(
		form && 'errors' in form && form.errors
			? (form.errors as Record<string, string[]>)
			: {}
	);

	const values = $derived(
		form && 'values' in form && form.values && typeof form.values === 'object'
			? (form.values as Record<string, string>)
			: {}
	);

	const initial = $derived({
		// C1-PRJ-A: prefer the deep-link prefills (?projectId=) over the
		// post-fail values; both fall back to empty string.
		customerId:
			values['customerId'] ?? data.prefillCustomerId ?? '',
		kategorieId: values['kategorieId'] ?? '',
		projectId: values['projectId'] ?? data.prefillProjectId ?? '',
		rechnungsdatum: values['rechnungsdatum'] ?? data.today,
		leistungsDatum: values['leistungsDatum'] ?? '',
		faelligkeitsDatum: values['faelligkeitsDatum'] ?? '',
		leistungszeitraum: values['leistungszeitraum'] ?? '',
		bezeichnung: values['bezeichnung'] ?? '',
		leistungsBeschreibung: values['leistungsBeschreibung'] ?? '',
		nettoEur: values['nettoEur'] ?? ''
	});
</script>

<svelte:head>
	<title>Neue Rechnung - {page.data.vereinName}</title>
</svelte:head>

<PageShell width="list">
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<div class="mb-6">
		<a
			href="/app/rechnungen"
			class="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Zurück zu Rechnungen
		</a>
		<h1 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-ink-900">Neue Rechnung</h1>
		<p class="mt-0.5 text-sm text-ink-500">
			Die Vorschau ist das echte PDF — was du siehst, geht raus.
		</p>
	</div>

	{#if form && 'error' in form && form.error}
		<div class="mb-4 rounded-xl border border-severity-critical/30 bg-severity-critical/10 px-4 py-3 text-sm text-severity-critical-text">
			{form.error}
		</div>
	{/if}

	{#if data.from === 'projekt' && data.prefillProjectId}
		<div
			class="mb-4 rounded-md bg-secondary px-3 py-2 text-xs text-ink-500"
			data-testid="invoice-from-projekt"
		>
			Aus Projekt —
			<a
				class="font-semibold text-ink-700 underline"
				href={`/app/projekte/${data.prefillProjectId}`}
			>
				zum Projekt zurück
			</a>
		</div>
	{:else if data.prefillCustomerName}
		<div class="mb-4 rounded-md bg-secondary px-3 py-2 text-xs text-ink-500" data-testid="invoice-from-customer">
			Für <span class="font-semibold text-ink-700">{data.prefillCustomerName}</span>
		</div>
	{/if}

	<InvoiceForm
		customers={data.customers}
		kategorien={data.kategorien}
		projects={data.projects}
		invoiceNumberPreview={data.invoiceNumberPreview}
		{initial}
		{errors}
		cancelHref="/app/rechnungen"
	/>
</PageShell>

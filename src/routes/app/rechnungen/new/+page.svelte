<script lang="ts">
	import { page } from '$app/state';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
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
		// Leistungsdatum is mandatory (Andy-Feedback 2026-07) — default it to
		// today so the field is practically never empty; the user overrides it
		// when the service happened in another month. The form auto-derives the
		// Leistungszeitraum month from it.
		leistungsDatum: values['leistungsDatum'] ?? data.today,
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
	<PageHeader title="Neue Rechnung" backHref="/app/rechnungen" backLabel="Rechnungen">
		{#snippet meta()}
		<p>Die Vorschau ist das echte PDF — was du siehst, geht raus.</p>
		{/snippet}
	</PageHeader>

	{#if form && 'error' in form && form.error}
		<div class="mb-4 rounded-xl border border-severity-critical/30 bg-severity-critical/10 px-4 py-3 text-sm text-severity-critical-text">
			{form.error}
		</div>
	{/if}

	{#if data.from === 'projekt' && data.prefillProjectId}
		<div
			class="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-secondary/60 px-4 py-2.5 text-sm text-ink-700"
			data-testid="invoice-from-projekt"
		>
			<svg
				class="h-4 w-4 shrink-0 text-ink-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
				><circle cx="12" cy="12" r="10" /><path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 16v-4M12 8h.01"
				/></svg
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
		<div
			class="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-secondary/60 px-4 py-2.5 text-sm text-ink-700"
			data-testid="invoice-from-customer"
		>
			<svg
				class="h-4 w-4 shrink-0 text-ink-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
				><circle cx="12" cy="12" r="10" /><path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 16v-4M12 8h.01"
				/></svg
			>
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

<script lang="ts">
	import { page } from '$app/state';
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

	// Hydration: when the form fails server-side, prefer the submitted values
	// (so the user keeps what they typed); otherwise show the existing invoice
	// values from data.initial.
	const initial = $derived({
		customerId: values['customerId'] ?? data.initial.customerId,
		kategorieId: values['kategorieId'] ?? data.initial.kategorieId,
		projectId: values['projectId'] ?? data.initial.projectId,
		rechnungsdatum: values['rechnungsdatum'] ?? data.initial.rechnungsdatum,
		leistungsDatum: values['leistungsDatum'] ?? data.initial.leistungsDatum,
		faelligkeitsDatum: values['faelligkeitsDatum'] ?? data.initial.faelligkeitsDatum,
		leistungszeitraum: values['leistungszeitraum'] ?? data.initial.leistungszeitraum,
		bezeichnung: values['bezeichnung'] ?? data.initial.bezeichnung,
		leistungsBeschreibung:
			values['leistungsBeschreibung'] ?? data.initial.leistungsBeschreibung,
		nettoEur: values['nettoEur'] ?? data.initial.nettoEur
	});
</script>

<svelte:head>
	<title>Rechnung bearbeiten - {page.data.vereinName}</title>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-8 sm:px-6">
	<div class="mb-6">
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={`/app/rechnungen/${data.invoice.id}`}
			class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Zurück zur Rechnung
		</a>
		<h1 class="mt-2 text-2xl font-bold tracking-tight text-foreground">
			Rechnung {data.invoice.businessId} bearbeiten
		</h1>
		<p class="mt-0.5 text-sm text-muted-foreground">
			Die Rechnungsnummer bleibt unverändert. Beim Speichern wird das PDF neu
			erstellt und ein Verlauf-Eintrag angelegt.
		</p>
	</div>

	{#if form && 'error' in form && form.error}
		<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
			{form.error}
		</div>
	{/if}

	<InvoiceForm
		customers={data.customers}
		kategorien={data.kategorien}
		projects={data.projects}
		invoiceNumberPreview={data.invoiceNumberPreview}
		{initial}
		{errors}
		submitAction="?/edit"
		submitLabel="Änderungen speichern"
		submitLabelPending="Wird gespeichert …"
	/>
</div>

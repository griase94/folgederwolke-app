<script lang="ts">
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
		customerId: values['customerId'] ?? '',
		kategorieId: values['kategorieId'] ?? '',
		projectId: values['projectId'] ?? '',
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
	<title>Neue Rechnung - Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-8 sm:px-6">
	<div class="mb-6">
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href="/app/rechnungen"
			class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Zurück zu Rechnungen
		</a>
		<h1 class="mt-2 text-2xl font-bold tracking-tight text-foreground">Neue Rechnung</h1>
		<p class="mt-0.5 text-sm text-muted-foreground">
			Die Vorschau aktualisiert sich automatisch. Mit „PDF generieren" wird die
			Rechnung gespeichert und das PDF im Hintergrund erstellt.
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
	/>
</div>

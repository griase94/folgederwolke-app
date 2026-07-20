<script lang="ts">
	import { page } from '$app/state';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
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
	// values from data.initial. Only reachable when !data.blocked.
	const initial = $derived(
		data.blocked
			? null
			: {
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
				}
	);
</script>

<svelte:head>
	<title>Rechnung bearbeiten - {page.data.vereinName}</title>
</svelte:head>

{#if data.blocked}
	<!-- Aurora E2 DELTA §6.4: designed lock page — replaces the old bare
	     error(403) boundary. Same anatomy as the plate's "Bearbeiten gesperrt"
	     state-frame: a warn callout with the verbatim German reason, the
	     invoice's business id, and a way back to the invoice. -->
	<PageShell width="list">
		<div class="mx-auto max-w-md py-10" data-testid="invoice-edit-blocked">
			<div class="rounded-2xl border border-border bg-card p-6 shadow-sm">
				<div class="flex items-start gap-3">
					<span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-severity-warn/15 text-severity-warn-text" aria-hidden="true">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<rect x="3" y="11" width="18" height="11" rx="2" />
							<path d="M7 11V7a5 5 0 0 1 10 0v4" />
						</svg>
					</span>
					<div class="min-w-0">
						<p class="text-[15px] font-bold text-ink-900">Diese Rechnung ist gesperrt</p>
						<p class="mt-1 text-sm text-ink-500">{data.blocked.reason}</p>
					</div>
				</div>

				<div class="mt-5 flex items-center justify-between rounded-xl border border-hairline bg-secondary px-4 py-3">
					<span class="text-xs font-semibold uppercase tracking-wide text-ink-500">Rechnung</span>
					<span class="rounded-md bg-card px-2 py-0.5 font-mono text-sm font-semibold text-ink-700">{data.blocked.businessId}</span>
				</div>

				<Button href={`/app/rechnungen/${data.blocked.invoiceId}`} variant="ghost" class="mt-5 w-full">
					<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
					</svg>
					Zurück zur Rechnung
				</Button>
			</div>
		</div>
	</PageShell>
{:else}
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<PageShell width="list">
		<div class="mb-6">
			<a
				href={`/app/rechnungen/${data.invoice.id}`}
				class="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
				</svg>
				Zurück zur Rechnung
			</a>
			<h1 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-ink-900">
				{data.invoice.businessId} bearbeiten
			</h1>
			<div class="mt-3 flex items-start gap-2.5 rounded-xl border border-border bg-secondary px-3.5 py-2.5 text-sm text-ink-700">
				<svg class="mt-0.5 h-4 w-4 shrink-0 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<circle cx="12" cy="12" r="10" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4M12 8h.01" />
				</svg>
				Speichern erzeugt das PDF neu (Version vN).
			</div>
		</div>

		{#if form && 'error' in form && form.error}
			<div class="mb-4 rounded-xl border border-severity-critical/30 bg-severity-critical/10 px-4 py-3 text-sm text-severity-critical-text">
				{form.error}
			</div>
		{/if}

		<InvoiceForm
			customers={data.customers}
			kategorien={data.kategorien}
			projects={data.projects}
			invoiceNumberPreview={data.invoiceNumberPreview}
			initial={initial!}
			{errors}
			submitAction="?/edit"
			submitLabel="Änderungen speichern & PDF neu erzeugen"
			submitLabelPending="Wird gespeichert …"
			cancelHref={`/app/rechnungen/${data.invoice.id}`}
		/>
	</PageShell>
{/if}

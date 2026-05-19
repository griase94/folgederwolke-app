<!--
  InvoiceForm - the create-invoice form on /app/rechnungen/new.

  Live HTML preview (debounced 500ms) is rendered side-by-side on desktop
  via the parent grid; this component manages form state.

  Submit posts to the default action which:
    1. Validates input
    2. Allocates an FDW-{year}-{NNN} business id
    3. Inserts invoices + invoice_jobs rows
    4. Fires the async PDF generation
    5. Redirects to /app/rechnungen/{id} with ?job={jobId} so the detail
       page can poll for completion.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import InvoiceLivePreview from './InvoiceLivePreview.svelte';

	type CustomerOpt = { id: string; name: string; addressBlock: string | null };
	type KategorieOpt = { id: string; name: string };
	type ProjectOpt = { id: string; name: string };

	let {
		customers,
		kategorien,
		projects,
		invoiceNumberPreview,
		initial,
		errors = {}
	}: {
		customers: CustomerOpt[];
		kategorien: KategorieOpt[];
		projects: ProjectOpt[];
		invoiceNumberPreview: string;
		initial: {
			customerId: string;
			kategorieId: string;
			projectId: string;
			rechnungsdatum: string;
			leistungsDatum: string;
			faelligkeitsDatum: string;
			bezeichnung: string;
			leistungsBeschreibung: string;
			nettoEur: string;
		};
		errors?: Record<string, string[]>;
	} = $props();

	let customerId = $state('');
	let kategorieId = $state('');
	let projectId = $state('');
	let rechnungsdatum = $state('');
	let leistungsDatum = $state('');
	let faelligkeitsDatum = $state('');
	let bezeichnung = $state('');
	let leistungsBeschreibung = $state('');
	let nettoEur = $state('');

	$effect(() => {
		customerId = initial.customerId;
		kategorieId = initial.kategorieId;
		projectId = initial.projectId;
		rechnungsdatum = initial.rechnungsdatum;
		leistungsDatum = initial.leistungsDatum;
		faelligkeitsDatum = initial.faelligkeitsDatum;
		bezeichnung = initial.bezeichnung;
		leistungsBeschreibung = initial.leistungsBeschreibung;
		nettoEur = initial.nettoEur;
	});

	let submitting = $state(false);

	const selectedCustomer = $derived(customers.find((c) => c.id === customerId) ?? null);
	const nettoCents = $derived(parseEur(nettoEur));

	function parseEur(s: string): number {
		// Accept "12,34" or "12.34" or "12"
		const cleaned = s.trim().replace(/\./g, '').replace(',', '.');
		const n = parseFloat(cleaned);
		if (!Number.isFinite(n) || n <= 0) return 0;
		return Math.round(n * 100);
	}

	const previewInput = $derived({
		customerId,
		customerName: selectedCustomer?.name ?? '',
		customerAddressBlock: selectedCustomer?.addressBlock ?? null,
		rechnungsdatum,
		leistungsDatum: leistungsDatum || null,
		faelligkeitsDatum: faelligkeitsDatum || null,
		bezeichnung,
		leistungsBeschreibung: leistungsBeschreibung || null,
		nettoCents,
		currency: 'EUR'
	});

	function fieldError(field: string): string | null {
		return errors[field]?.[0] ?? null;
	}
</script>

<div class="grid gap-6 lg:grid-cols-2">
	<!-- ── Form ───────────────────────────────────────────────────────── -->
	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
		class="space-y-4"
	>
		<div>
			<label for="customerId" class="mb-1 block text-sm font-medium">Kund:in</label>
			<select
				id="customerId"
				name="customerId"
				bind:value={customerId}
				required
				class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="">-- bitte wählen --</option>
				{#each customers as c (c.id)}
					<option value={c.id}>{c.name}</option>
				{/each}
			</select>
			{#if fieldError('customerId')}
				<p class="mt-1 text-xs text-red-600">{fieldError('customerId')}</p>
			{/if}
		</div>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div>
				<label for="rechnungsdatum" class="mb-1 block text-sm font-medium">Rechnungsdatum</label>
				<input
					type="date"
					id="rechnungsdatum"
					name="rechnungsdatum"
					bind:value={rechnungsdatum}
					required
					class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
			<div>
				<label for="leistungsDatum" class="mb-1 block text-sm font-medium">Leistungsdatum (optional)</label>
				<input
					type="date"
					id="leistungsDatum"
					name="leistungsDatum"
					bind:value={leistungsDatum}
					class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
		</div>

		<div>
			<label for="faelligkeitsDatum" class="mb-1 block text-sm font-medium">Fällig bis (optional)</label>
			<input
				type="date"
				id="faelligkeitsDatum"
				name="faelligkeitsDatum"
				bind:value={faelligkeitsDatum}
				class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>

		<div>
			<label for="bezeichnung" class="mb-1 block text-sm font-medium">Bezeichnung</label>
			<input
				type="text"
				id="bezeichnung"
				name="bezeichnung"
				bind:value={bezeichnung}
				required
				minlength="3"
				maxlength="200"
				placeholder="z.B. Auftritt 12.05.2026"
				class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
			{#if fieldError('bezeichnung')}
				<p class="mt-1 text-xs text-red-600">{fieldError('bezeichnung')}</p>
			{/if}
		</div>

		<div>
			<label for="leistungsBeschreibung" class="mb-1 block text-sm font-medium">Leistungsbeschreibung (optional)</label>
			<textarea
				id="leistungsBeschreibung"
				name="leistungsBeschreibung"
				bind:value={leistungsBeschreibung}
				maxlength="2000"
				rows="3"
				class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			></textarea>
		</div>

		<div>
			<label for="nettoEur" class="mb-1 block text-sm font-medium">Betrag (EUR)</label>
			<input
				type="text"
				inputmode="decimal"
				id="nettoEur"
				name="nettoEur"
				bind:value={nettoEur}
				required
				placeholder="0,00"
				class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
			<p class="mt-1 text-xs text-muted-foreground">
				Brutto = Netto (§19 UStG / Kleinunternehmerregelung)
			</p>
			{#if fieldError('nettoCents')}
				<p class="mt-1 text-xs text-red-600">{fieldError('nettoCents')}</p>
			{/if}
		</div>

		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div>
				<label for="kategorieId" class="mb-1 block text-sm font-medium">Kategorie (optional)</label>
				<select
					id="kategorieId"
					name="kategorieId"
					bind:value={kategorieId}
					class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<option value="">--</option>
					{#each kategorien as k (k.id)}
						<option value={k.id}>{k.name}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="projectId" class="mb-1 block text-sm font-medium">Projekt (optional)</label>
				<select
					id="projectId"
					name="projectId"
					bind:value={projectId}
					class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<option value="">--</option>
					{#each projects as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="flex items-center justify-between pt-2">
			<p class="text-xs text-muted-foreground">
				Rechnungs-Nr. wird vergeben:
				<span class="font-mono font-medium">{invoiceNumberPreview}</span>
			</p>
			<Button
				type="submit"
				disabled={submitting || !customerId || nettoCents <= 0}
				class="bg-primary text-primary-foreground hover:bg-primary/90"
			>
				{submitting ? 'Wird erstellt …' : 'PDF generieren'}
			</Button>
		</div>
	</form>

	<!-- ── Live preview ──────────────────────────────────────────────── -->
	<div class="lg:sticky lg:top-4 lg:self-start">
		<InvoiceLivePreview input={previewInput} />
	</div>
</div>

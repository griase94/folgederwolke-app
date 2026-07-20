<!--
	CustomerInfoCard — the Übersicht "Stammdaten" facts (kunde-detail-v1).
	Built on the FactsTable primitive so every value sits on ONE right-hand
	ruler; the multi-line address is a full-width sub-row (verbatim, F6). The
	E-Mail row carries the amber flag-warn when no address is on file (spec §2.4
	/ G3 — without it, no Mail-Versand). Trailing rows use the same ruler.
-->
<script lang="ts">
	import FactsTable, { type FactRow } from '$lib/components/ui/facts-table/FactsTable.svelte';
	import { countryLabel } from '$lib/domain/customers.js';
	import type { CustomerView } from '$lib/server/domain/customers.js';

	let {
		customer,
		onEditEmail
	}: {
		customer: CustomerView;
		/** Opens the edit dialog from the "Keine E-Mail — ergänzen" flag. */
		onEditEmail: () => void;
	} = $props();

	const rows = $derived.by(() => {
		const r: FactRow[] = [];
		if (customer.anrede) r.push({ label: 'Anrede', value: customer.anrede });
		if (customer.addressBlock)
			r.push({ label: 'Adresse', value: customer.addressBlock, block: true });
		r.push({ label: 'Land', value: countryLabel(customer.country) });
		return r;
	});

	const seit = $derived(
		new Date(customer.createdAt).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
	);
</script>

<!-- rows = Anrede/Adresse/Land; the trailing bespoke rows below live inside the
	 same FactsTable ruler (default children → the primitive's `children` slot). -->
<FactsTable {rows} data-testid="customer-facts">
	<!-- E-Mail — flag-warn (amber) when missing -->
	<div class="grid min-h-10 items-baseline gap-4 border-t border-hairline py-2.5" style="grid-template-columns: var(--facts-lbl) minmax(0, 1fr)">
		<dt class="text-xs font-medium text-ink-500">E-Mail</dt>
		<dd class="flex min-w-0 justify-end text-right text-[13px] font-semibold text-ink-900">
			{#if customer.email}
				<a href="mailto:{customer.email}" class="truncate hover:text-primary-text hover:underline">{customer.email}</a>
			{:else}
				<button
					type="button"
					onclick={onEditEmail}
					data-testid="customer-email-missing"
					class="inline-flex items-center gap-1.5 rounded-full bg-severity-warn-tint px-2.5 py-0.5 text-[11px] font-semibold text-severity-warn-text ring-1 ring-inset ring-severity-warn/25 hover:brightness-95"
				>
					<svg class="h-3.5 w-3.5 text-severity-warn" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
					Keine E-Mail — ergänzen
				</button>
			{/if}
		</dd>
	</div>

	{#if customer.notes}
		<div class="grid grid-cols-1 border-t border-hairline py-2.5">
			<dt class="text-xs font-medium text-ink-500">Notizen</dt>
			<dd class="mt-1 whitespace-pre-line text-[13px] font-medium text-ink-900">{customer.notes}</dd>
		</div>
	{/if}

	<div class="grid min-h-10 items-baseline gap-4 border-t border-hairline py-2.5" style="grid-template-columns: var(--facts-lbl) minmax(0, 1fr)">
		<dt class="text-xs font-medium text-ink-500">Dabei seit</dt>
		<dd class="min-w-0 text-right text-[13px] font-semibold text-ink-900">{seit}</dd>
	</div>
</FactsTable>

<!--
	CustomerList — active stack + a quiet "Archiviert · N" section (kunden-v5).
	Archived customers stay reachable (restore via kebab) but never mix into the
	active roster. Empty (first-run) and no-results states carry their own CTA.
-->
<script lang="ts">
	import CustomerRow from './CustomerRow.svelte';
	import SearchNoResults from '$lib/components/empty/SearchNoResults.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { CustomerListView } from '$lib/server/domain/customers.js';

	let {
		customers,
		query = '',
		onEdit,
		onArchive,
		onRestore,
		onAdd,
		onClearSearch
	}: {
		customers: CustomerListView[];
		query?: string;
		onEdit: (c: CustomerListView) => void;
		onArchive: (c: CustomerListView) => void;
		onRestore: (c: CustomerListView) => void;
		onAdd?: () => void;
		onClearSearch?: () => void;
	} = $props();

	const hasQuery = $derived(query.trim().length > 0);
	const active = $derived(customers.filter((c) => !c.deletedAt));
	const archived = $derived(customers.filter((c) => !!c.deletedAt));
</script>

{#if customers.length === 0 && hasQuery}
	<SearchNoResults {query} onClear={onClearSearch} />
{:else if customers.length === 0}
	<div data-testid="customer-empty-state" class="grid place-items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center shadow-sm">
		<div class="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-brand-soft text-primary-text" aria-hidden="true">
			<svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 21V5a2 2 0 012-2h8a2 2 0 012 2v16M6 10H4a2 2 0 00-2 2v7a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-2M10 8h4m-4 4h4m-4 9v-3a2 2 0 014 0v3" /></svg>
		</div>
		<h3 class="text-base font-bold text-ink-900">Noch keine Kund:innen</h3>
		<p class="mt-1.5 max-w-sm text-sm text-ink-500">Leg die erste an, um loszulegen. Kund:innen sind die Empfänger:innen deiner Rechnungen.</p>
		{#if onAdd}
			<Button class="mt-5" onclick={onAdd}>Kunde hinzufügen</Button>
		{/if}
	</div>
{:else}
	<div class="flex flex-col gap-2.5" role="list" aria-label="Kundenliste">
		{#each active as customer (customer.id)}
			<div role="listitem">
				<CustomerRow {customer} {onEdit} {onArchive} {onRestore} />
			</div>
		{/each}

		{#if archived.length > 0}
			<div class="mt-3 flex items-center gap-2.5 px-1 pb-0.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-300">
				Archiviert · {archived.length}
				<span class="h-px flex-1 bg-hairline"></span>
			</div>
			{#each archived as customer (customer.id)}
				<div role="listitem">
					<CustomerRow {customer} {onEdit} {onArchive} {onRestore} />
				</div>
			{/each}
		{/if}
	</div>
{/if}

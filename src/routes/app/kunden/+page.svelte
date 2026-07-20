<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import CustomerList from '$lib/components/admin/customers/CustomerList.svelte';
	import AddCustomerDialog from '$lib/components/admin/customers/AddCustomerDialog.svelte';
	import EditCustomerDialog from '$lib/components/admin/customers/EditCustomerDialog.svelte';
	import type { CustomerListView } from '$lib/server/domain/customers.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let addOpen = $state(false);
	let editOpen = $state(false);
	let editCustomer = $state<CustomerListView | null>(null);
	let editStartArchive = $state(false);
	let searchQuery = $state('');

	const all = $derived(data.customers as CustomerListView[]);

	const filtered = $derived(
		searchQuery.trim().length === 0
			? all
			: all.filter((c) => {
					const q = searchQuery.trim().toLowerCase();
					return (
						c.name.toLowerCase().includes(q) ||
						(c.email?.toLowerCase().includes(q) ?? false) ||
						(c.notes?.toLowerCase().includes(q) ?? false)
					);
				})
	);

	const activeCount = $derived(all.filter((c) => !c.deletedAt).length);
	const archivedCount = $derived(all.filter((c) => !!c.deletedAt).length);
	const offenTotal = $derived(
		all.filter((c) => !c.deletedAt).reduce((sum, c) => sum + c.offenCents, 0)
	);

	function openEdit(c: CustomerListView) {
		editCustomer = c;
		editStartArchive = false;
		editOpen = true;
	}
	function openArchive(c: CustomerListView) {
		editCustomer = c;
		editStartArchive = true;
		editOpen = true;
	}
	async function restore(c: CustomerListView) {
		const fd = new FormData();
		fd.set('id', c.id);
		await fetch('?/restore', { method: 'POST', body: fd });
		await invalidateAll();
		toast.info(`${c.name} wiederhergestellt`);
	}
</script>

<svelte:head>
	<title>Kunden – {page.data.vereinName}</title>
</svelte:head>

<PageShell width="list">
	<!-- Header -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-[-0.02em] text-ink-900">Kunden</h1>
			<p class="mt-0.5 text-sm text-ink-500">Rechnungsempfänger verwalten</p>
		</div>
		<Button onclick={() => (addOpen = true)} data-testid="add-customer" class="max-sm:w-full">
			<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M2 21v-2a4 4 0 014-4h5a4 4 0 014 4v2M9 7a4 4 0 108 0 4 4 0 00-8 0zM19 8v6M22 11h-6" />
			</svg>
			Kunde hinzufügen
		</Button>
	</div>

	<!-- Toolbar: search + meta -->
	<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
		<div class="relative w-full sm:max-w-xs">
			<svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="11" cy="11" r="8" /><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35" />
			</svg>
			<input
				type="search"
				placeholder="Suchen…"
				bind:value={searchQuery}
				aria-label="Kunden suchen"
				data-testid="customer-search"
				class="h-10 w-full rounded-lg border border-border bg-card py-1 pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
			/>
		</div>
		<p class="text-xs text-ink-500 sm:ml-auto">
			<b class="font-bold text-ink-700">{activeCount}</b> Kund:innen{#if archivedCount > 0} · <b class="font-bold text-ink-700">{archivedCount}</b> archiviert{/if}{#if offenTotal > 0} · <b class="font-bold text-ink-700 tabular-nums">{formatMoney(offenTotal)}</b> offen an uns{/if}
		</p>
	</div>

	<!-- List -->
	<CustomerList
		customers={filtered}
		query={searchQuery}
		onEdit={openEdit}
		onArchive={openArchive}
		onRestore={restore}
		onAdd={() => (addOpen = true)}
		onClearSearch={() => (searchQuery = '')}
	/>
</PageShell>

<AddCustomerDialog bind:open={addOpen} />
<EditCustomerDialog bind:open={editOpen} customer={editCustomer} startInArchiveMode={editStartArchive} />

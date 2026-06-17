<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import CustomerList from '$lib/components/admin/customers/CustomerList.svelte';
	import AddCustomerDialog from '$lib/components/admin/customers/AddCustomerDialog.svelte';
	import EditCustomerDialog from '$lib/components/admin/customers/EditCustomerDialog.svelte';
	import type { CustomerView } from '$lib/server/domain/customers.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let addOpen = $state(false);
	let editOpen = $state(false);
	let editCustomer = $state<CustomerView | null>(null);

	let searchQuery = $state('');

	const filteredCustomers = $derived(
		searchQuery.trim().length === 0
			? data.customers
			: data.customers.filter((c) => {
					const q = searchQuery.trim().toLowerCase();
					return (
						c.name.toLowerCase().includes(q) ||
						(c.email?.toLowerCase().includes(q) ?? false) ||
						(c.anrede?.toLowerCase().includes(q) ?? false)
					);
				})
	);

	function openEdit(c: CustomerView) {
		editCustomer = c;
		editOpen = true;
	}
</script>

<svelte:head>
	<title>Kunden – {page.data.vereinName}</title>
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-8 sm:px-6">
	<!-- Header -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground">Kunden</h1>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Rechnungsempfänger verwalten
			</p>
		</div>
		<Button
			onclick={() => (addOpen = true)}
			class="bg-primary-strong text-primary-foreground hover:bg-primary-strong/90"
		>
			<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			Kunde hinzufügen
		</Button>
	</div>

	<!-- Search -->
	<div class="mb-4">
		<div class="relative w-full sm:max-w-xs">
			<svg
				class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="8" />
				<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35" />
			</svg>
			<input
				type="search"
				placeholder="Suchen…"
				bind:value={searchQuery}
				aria-label="Kunden suchen"
				class="border-input focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent py-1 pl-8 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
			/>
		</div>
	</div>

	<!-- List -->
	<CustomerList
		customers={filteredCustomers}
		query={searchQuery}
		onClearSearch={() => (searchQuery = '')}
		onEdit={openEdit}
		onAdd={() => (addOpen = true)}
	/>
</div>

<AddCustomerDialog bind:open={addOpen} />
<EditCustomerDialog bind:open={editOpen} customer={editCustomer} />

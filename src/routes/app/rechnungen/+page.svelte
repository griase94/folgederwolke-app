<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import InvoiceList from '$lib/components/admin/invoices/InvoiceList.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state('');

	const filtered = $derived(
		searchQuery.trim().length === 0
			? data.invoices
			: data.invoices.filter((inv) => {
					const q = searchQuery.trim().toLowerCase();
					return (
						inv.businessId.toLowerCase().includes(q) ||
						inv.customerName.toLowerCase().includes(q) ||
						inv.bezeichnung.toLowerCase().includes(q)
					);
				})
	);
</script>

<svelte:head>
	<title>Rechnungen - Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-8 sm:px-6">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground">Rechnungen</h1>
			<p class="mt-0.5 text-sm text-muted-foreground">
				{data.invoices.length}
				{data.invoices.length === 1 ? 'Rechnung' : 'Rechnungen'}
			</p>
		</div>
		<Button
			href="/app/rechnungen/new"
			class="bg-primary text-primary-foreground hover:bg-primary/90"
		>
			<svg
				class="mr-2 h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			Neue Rechnung
		</Button>
	</div>

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
				placeholder="Suchen ..."
				bind:value={searchQuery}
				aria-label="Rechnungen suchen"
				class="border-input focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent py-1 pl-8 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
			/>
		</div>
	</div>

	<InvoiceList invoices={filtered} />
</div>

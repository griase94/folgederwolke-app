<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import type { CustomerView } from '$lib/server/domain/customers.js';

	let {
		customer,
		onEdit
	}: { customer: CustomerView; onEdit: (c: CustomerView) => void } = $props();

	let dropdownOpen = $state(false);

	const isArchived = $derived(!!customer.deletedAt);
</script>

<div
	class="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md {isArchived ? 'opacity-60' : ''}"
>
	<!-- Icon -->
	<div
		class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800"
		aria-hidden="true"
	>
		<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
		</svg>
	</div>

	<!-- Name + meta -->
	<div class="min-w-0 flex-1">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/kunden/{customer.id}" class="block truncate font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
			{customer.name}
		</a>
		<div class="flex flex-wrap items-center gap-2 mt-0.5">
			{#if customer.email}
				<span class="text-xs text-muted-foreground">{customer.email}</span>
			{/if}
			{#if isArchived}
				<span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">archiviert</span>
			{/if}
		</div>
	</div>

	<!-- Actions -->
	<DropdownMenu.Root bind:open={dropdownOpen}>
		<DropdownMenu.Trigger
			aria-label="Aktionen für {customer.name}"
			class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="12" cy="5" r="1.5" />
				<circle cx="12" cy="12" r="1.5" />
				<circle cx="12" cy="19" r="1.5" />
			</svg>
		</DropdownMenu.Trigger>

		<DropdownMenu.Content align="end" class="w-44">
			<DropdownMenu.Item
				onSelect={() => {
					dropdownOpen = false;
					onEdit(customer);
				}}
			>
				<svg class="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
				</svg>
				Bearbeiten
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import EditCustomerDialog from './EditCustomerDialog.svelte';
	import type { CustomerView } from '$lib/server/domain/customers.js';

	let { customer }: { customer: CustomerView } = $props();

	let editOpen = $state(false);

	function formatDate(d: string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('de-DE', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	const isArchived = $derived(!!customer.deletedAt);
</script>

<Card.Root class="overflow-hidden">
	<div class="h-2 bg-gradient-to-r from-sky-400 to-cyan-500"></div>

	<Card.Content class="p-6">
		<!-- Icon + name -->
		<div class="mb-6 flex items-start gap-4">
			<div
				class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-800 shadow-sm"
				aria-hidden="true"
			>
				<svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
				</svg>
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="truncate text-xl font-bold text-foreground">{customer.name}</h2>
				<div class="mt-1 flex flex-wrap items-center gap-2">
					{#if isArchived}
						<span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
							archiviert
						</span>
					{:else}
						<span class="inline-flex items-center rounded-full border border-green-200 bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
							aktiv
						</span>
					{/if}
					{#if customer.isFixture}
						<span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
							Fixture
						</span>
					{/if}
				</div>
			</div>
		</div>

		<dl class="space-y-3">
			{#if customer.anrede}
				<div class="flex items-start gap-3">
					<dt class="flex w-28 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">Anrede</dt>
					<dd class="text-sm text-foreground">{customer.anrede}</dd>
				</div>
			{/if}

			{#if customer.email}
				<div class="flex items-start gap-3">
					<dt class="flex w-28 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">E-Mail</dt>
					<dd class="min-w-0 flex-1 break-all text-sm font-medium text-foreground">
						<a href="mailto:{customer.email}" class="hover:text-primary hover:underline">
							{customer.email}
						</a>
					</dd>
				</div>
			{/if}

			{#if customer.addressBlock}
				<div class="flex items-start gap-3">
					<dt class="flex w-28 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">Adresse</dt>
					<dd class="min-w-0 flex-1 whitespace-pre-wrap text-sm text-foreground">{customer.addressBlock}</dd>
				</div>
			{/if}

			{#if customer.notes}
				<div class="flex items-start gap-3">
					<dt class="flex w-28 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">Notizen</dt>
					<dd class="min-w-0 flex-1 whitespace-pre-wrap text-sm text-foreground">{customer.notes}</dd>
				</div>
			{/if}

			<div class="flex items-start gap-3">
				<dt class="flex w-28 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">Angelegt</dt>
				<dd class="text-sm text-muted-foreground">{formatDate(customer.createdAt)}</dd>
			</div>
		</dl>

		<div class="mt-6 border-t border-border pt-4">
			<Button
				variant="outline"
				class="w-full"
				onclick={() => (editOpen = true)}
				aria-label="Kunden bearbeiten"
			>
				<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
				</svg>
				Bearbeiten
			</Button>
		</div>
	</Card.Content>
</Card.Root>

<EditCustomerDialog bind:open={editOpen} {customer} />

<!--
	CustomerDetailHero — the neutral entity-head (kunde-detail-v1 khead).
	No money type-colour on the head: initials avatar, name, an E-Mail / Ort
	subline, a Land tag only when ≠ DE, the gradient hairline as the sole brand
	accent, and ONE ghost "Bearbeiten" CTA (disabled while archived).
-->
<script lang="ts">
	import { countryLabel, deriveOrt } from '$lib/domain/customers.js';
	import type { CustomerView } from '$lib/server/domain/customers.js';

	let {
		customer,
		onEdit,
		editDisabled = false
	}: {
		customer: CustomerView;
		onEdit: () => void;
		editDisabled?: boolean;
	} = $props();

	const isArchived = $derived(!!customer.deletedAt);
	const initials = $derived(
		customer.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0])
			.join('')
			.toUpperCase() || '?'
	);
	const ort = $derived(deriveOrt(customer.addressBlock));
	const showLand = $derived(customer.country !== 'DE');
</script>

<div class="flex items-start gap-4 sm:gap-5">
	<div
		class="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-hairline bg-secondary text-xl font-bold text-ink-700 sm:h-[60px] sm:w-[60px] {isArchived ? 'opacity-60' : ''}"
		aria-hidden="true"
	>
		{initials}
	</div>
	<div class="min-w-0 flex-1">
		<h1 class="text-2xl font-bold tracking-[-0.02em] {isArchived ? 'text-ink-700' : 'text-ink-900'}">{customer.name}</h1>
		<div class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-ink-500">
			{#if customer.email}
				<span class="flex min-w-0 items-center gap-1.5">
					<svg class="h-4 w-4 shrink-0 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l9 6 9-6" /><rect x="3" y="5" width="18" height="14" rx="2" /></svg>
					<span class="break-all">{customer.email}</span>
				</span>
			{:else if ort}
				<span class="flex items-center gap-1.5">
					<svg class="h-4 w-4 shrink-0 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 21V5a2 2 0 012-2h8a2 2 0 012 2v16M6 10H4a2 2 0 00-2 2v7a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-2" /></svg>
					{ort}
				</span>
			{/if}
			{#if showLand}
				<span class="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-ink-700">{countryLabel(customer.country)}</span>
			{/if}
		</div>
	</div>
	<button
		type="button"
		onclick={onEdit}
		disabled={editDisabled}
		class="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
		title={editDisabled ? 'Archivierte Kunden lassen sich nicht bearbeiten' : undefined}
	>
		<svg class="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
		<span class="max-sm:sr-only">Bearbeiten</span>
	</button>
</div>
<div class="mt-5 h-0.5 rounded bg-gradient-brand" aria-hidden="true"></div>

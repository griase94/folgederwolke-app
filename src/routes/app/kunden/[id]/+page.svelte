<script lang="ts">
	import { page } from '$app/state';
	import CustomerDetailHero from '$lib/components/admin/customers/CustomerDetailHero.svelte';
	import CustomerInfoCard from '$lib/components/admin/customers/CustomerInfoCard.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	type Tab = 'uebersicht' | 'rechnungen' | 'projekte';
	let activeTab = $state<Tab>('uebersicht');

	const tabs: Array<{ id: Tab; label: string }> = [
		{ id: 'uebersicht', label: 'Übersicht' },
		{ id: 'rechnungen', label: 'Rechnungen' },
		{ id: 'projekte', label: 'Projekte' },
	];

	function fmtEur(cents: number) {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}
</script>

<svelte:head>
	<title>{data.customer.name} – Kunden – {page.data.vereinName}</title>
</svelte:head>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<div class="container mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<!-- Breadcrumb -->
	<nav class="mb-4 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Brotkrümel">
		<a
			href="/app/kunden"
			class="flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<svg
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Kunden
		</a>
		<span aria-hidden="true">/</span>
		<span class="truncate font-medium text-foreground">{data.customer.name}</span>
	</nav>

	<CustomerDetailHero customer={data.customer} />

	<nav class="flex gap-2 overflow-x-auto border-b border-border" aria-label="Kunden-Tabs">
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				onclick={() => (activeTab = tab.id)}
				aria-pressed={activeTab === tab.id}
				class={[
					'border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors',
					activeTab === tab.id
						? 'border-primary text-foreground'
						: 'border-transparent text-muted-foreground hover:text-foreground',
				].join(' ')}
			>
				{tab.label}
			</button>
		{/each}
	</nav>

	<div class="mt-4">
		{#if activeTab === 'uebersicht'}
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
				<div class="lg:sticky lg:top-4 lg:self-start">
					<CustomerInfoCard customer={data.customer} />
				</div>
				<div class="text-muted-foreground">
					<p>Übersicht über die letzten Aktivitäten dieses Kunden.</p>
					{#if data.rechnungen.length > 0}
						<p class="mt-2 text-sm">{data.rechnungen.length} Rechnung(en) verknüpft.</p>
					{/if}
					{#if data.projekte.length > 0}
						<p class="mt-1 text-sm">{data.projekte.length} Projekt(e) als Standard-Kunde.</p>
					{/if}
				</div>
			</div>
		{:else if activeTab === 'rechnungen'}
			{#if data.rechnungen.length === 0}
				<div
					class="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-muted-foreground"
				>
					Noch keine Rechnungen für diesen Kunden.
				</div>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each data.rechnungen as r (r.id)}
						<li>
							<a
								href="/app/rechnungen/{r.businessId}"
								class="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent dark:hover:bg-accent/40"
							>
								<div class="flex flex-col">
									<span class="font-medium">{r.businessId} · {r.bezeichnung}</span>
									<span class="text-sm text-muted-foreground">{r.rechnungsdatum ?? '—'}</span>
								</div>
								<div class="flex items-center gap-2">
									<span class="tabular-nums font-semibold">{fmtEur(r.nettoCents)}</span>
									<span
										class={[
											'rounded-full px-2 py-0.5 text-xs font-medium',
											r.bezahltAm
												? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
												: 'bg-muted text-muted-foreground',
										].join(' ')}>{r.bezahltAm ? 'bezahlt' : 'offen'}</span
									>
								</div>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		{:else if activeTab === 'projekte'}
			{#if data.projekte.length === 0}
				<div
					class="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-muted-foreground"
				>
					Keine Projekte mit diesem Kunden als Standard-Kunde.
				</div>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each data.projekte as p (p.id)}
						<li>
							<a
								href="/app/projekte/{p.id}"
								class="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent dark:hover:bg-accent/40"
							>
								<span class="text-sm text-muted-foreground">{p.businessId}</span>
								<span class="font-medium">{p.name}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</div>

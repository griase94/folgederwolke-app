<script lang="ts">
	import { page } from '$app/state';
	import { afterNavigate, replaceState } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import InvoiceList from '$lib/components/admin/invoices/InvoiceList.svelte';
	import {
		rechnungenStatusLabel,
		type RechnungenStatus
	} from '$lib/domain/invoices.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// Flash after the per-row inline mark-paid / undo POST + redirect. afterNavigate
	// (not onMount) so it fires on the client-nav path too; strip the flash param
	// via shallow replaceState so a reload can't re-fire it (see the detail page
	// for the full rationale — this was a latent double-flash bug).
	afterNavigate(() => {
		const params = page.url.searchParams;
		let message: string | null = null;
		let kind: 'success' | 'info' = 'success';
		if (params.get('paid') === '1') message = 'Als bezahlt markiert';
		else if (params.get('undone') === '1') {
			message = 'Zahlung zurückgenommen';
			kind = 'info';
		}
		if (!message) return;

		if (kind === 'info') toast.info(message);
		else toast.success(message);

		const url = new URL(page.url);
		url.searchParams.delete('paid');
		url.searchParams.delete('undone');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same-page shallow strip of a flash query param
		replaceState(url, page.state);
	});

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

	const hasActiveStatusFilter = $derived(data.filters.status !== 'alle');

	// Aggregate of the currently status-filtered set (server-side filtered), for
	// the quiet info band: "— N Rechnungen · X €".
	const filterAggregate = $derived({
		count: data.invoices.length,
		sumCents: data.invoices.reduce((sum, r) => sum + r.bruttoCents, 0)
	});

	// Filter chips — counts come from the year-wide server aggregate so they
	// never shift when a status filter is active. Rechnungen sind Einnahmen:
	// „offen" bleibt neutral, „überfällig" amber, „bezahlt" grün.
	const chips = $derived([
		{ status: 'alle' as RechnungenStatus, label: 'Alle', count: data.meta.all },
		{ status: 'offen' as RechnungenStatus, label: 'Offen', count: data.meta.offen },
		{ status: 'überfällig' as RechnungenStatus, label: 'Überfällig', count: data.meta.ueberfaellig },
		{ status: 'bezahlt' as RechnungenStatus, label: 'Bezahlt', count: data.meta.bezahlt }
	]);

	function chipHref(status: RechnungenStatus): string {
		const year = `year=${data.filters.year}`;
		return status === 'alle'
			? `/app/rechnungen?${year}`
			: `/app/rechnungen?status=${encodeURIComponent(status)}&${year}`;
	}
</script>

<svelte:head>
	<title>Rechnungen – {page.data.vereinName}</title>
</svelte:head>

<PageShell width="list">
	<!-- Header -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-[-0.02em] text-ink-900">Rechnungen</h1>
			<p class="mt-0.5 text-sm text-ink-500">
				{#if data.meta.all === 0}
					Rechnungen an Kund:innen — Nummer, PDF und Buchung übernimmt folgederwolke
				{:else}
					{data.meta.all}
					{data.meta.all === 1 ? 'Rechnung' : 'Rechnungen'}{#if data.meta.offenSummeCents > 0}<span class="mx-1.5 text-ink-300">·</span><b class="font-bold tabular-nums text-open-ink">{formatMoney(data.meta.offenSummeCents)}</b> warten aufs Konto{/if}
				{/if}
			</p>
		</div>
		<div class="flex gap-2 max-sm:flex-col">
			<!-- Secondary link — desktop only; on mobile the single CTA is „Neue Rechnung". -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<Button href="/app/kunden" variant="ghost" class="hidden sm:inline-flex">
				<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M2 21v-2a4 4 0 014-4h5a4 4 0 014 4v2M9 7a4 4 0 108 0 4 4 0 00-8 0zM19 8v6M22 11h-6" />
				</svg>
				Kund:innen
			</Button>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<Button href="/app/rechnungen/new" data-testid="new-invoice" class="max-sm:w-full">
				<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				Neue Rechnung
			</Button>
		</div>
	</div>

	<!-- Toolbar: filter chips + search -->
	<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] sm:overflow-visible" role="tablist" aria-label="Rechnungen filtern">
			{#each chips as chip (chip.status)}
				{@const isActive = data.filters.status === chip.status}
				<a
					href={chipHref(chip.status)}
					role="tab"
					aria-selected={isActive}
					data-testid="rechnungen-chip-{chip.status === 'überfällig' ? 'ueberfaellig' : chip.status}"
					class="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {isActive
						? 'border-transparent bg-primary-strong text-primary-foreground shadow-sm'
						: 'border-border bg-card text-ink-500 hover:border-input hover:text-ink-700'}"
				>
					{chip.label}
					<span class="tabular-nums {isActive ? 'text-primary-foreground/75' : 'text-ink-300'}">{chip.count}</span>
				</a>
			{/each}
		</div>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		<div class="relative w-full sm:ml-auto sm:max-w-xs">
			<svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="11" cy="11" r="8" /><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35" />
			</svg>
			<input
				type="search"
				placeholder="Nummer, Kund:in, Bezeichnung…"
				bind:value={searchQuery}
				aria-label="Rechnungen suchen"
				data-testid="invoice-search"
				class="h-10 w-full rounded-lg border border-border bg-card py-1 pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
			/>
		</div>
	</div>

	<!-- Active-filter band (arrived from the dashboard chip) -->
	{#if hasActiveStatusFilter}
		<div
			class="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-secondary/60 px-4 py-2.5 text-sm text-ink-700"
			role="status"
			aria-live="polite"
			data-testid="rechnungen-active-filter"
		>
			<svg class="h-4 w-4 shrink-0 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4M12 8h.01" /></svg>
			<span class="font-medium">
				Zeige nur {rechnungenStatusLabel(data.filters.status).toLowerCase()}e Rechnungen aus {data.filters.year}{#if filterAggregate.count > 0}<span class="font-normal text-ink-500">&nbsp;— {filterAggregate.count} {filterAggregate.count === 1 ? 'Rechnung' : 'Rechnungen'} · <span class="tabular-nums">{formatMoney(filterAggregate.sumCents)}</span></span>{/if}
			</span>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="/app/rechnungen?year={data.filters.year}" class="ml-auto text-xs font-semibold text-primary-text underline-offset-2 hover:underline" data-testid="rechnungen-clear-filter">
				Filter zurücksetzen
			</a>
		</div>
	{/if}

	<InvoiceList
		invoices={filtered}
		today={data.today}
		query={searchQuery}
		onClearSearch={() => (searchQuery = '')}
	/>
</PageShell>

<script lang="ts">
	import { page } from '$app/state';
	import { replaceState, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import CustomerDetailHero from '$lib/components/admin/customers/CustomerDetailHero.svelte';
	import CustomerInfoCard from '$lib/components/admin/customers/CustomerInfoCard.svelte';
	import EditCustomerDialog from '$lib/components/admin/customers/EditCustomerDialog.svelte';
	import { deriveInvoiceStatus, type InvoiceRowStatus } from '$lib/domain/invoices.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	type Rechnung = PageData['rechnungen'][number];

	let editOpen = $state(false);

	const isArchived = $derived(!!data.customer.deletedAt);

	// ── tab state (persisted in ?tab= so it survives a reload) ────────────────
	type Tab = 'uebersicht' | 'rechnungen' | 'projekte';
	const TABS: Array<{ id: Tab; label: string }> = [
		{ id: 'uebersicht', label: 'Übersicht' },
		{ id: 'rechnungen', label: 'Rechnungen' },
		{ id: 'projekte', label: 'Projekte' }
	];
	function tabFromUrl(): Tab {
		const t = page.url.searchParams.get('tab');
		return (['uebersicht', 'rechnungen', 'projekte'] as const).includes(t as Tab)
			? (t as Tab)
			: 'uebersicht';
	}
	// Local state drives the UI immediately; the URL is updated best-effort so
	// the active tab survives a reload (SSR reads ?tab= via tabFromUrl()).
	let activeTab = $state<Tab>(tabFromUrl());
	function setTab(t: Tab) {
		activeTab = t;
		const u = new URL(page.url);
		u.searchParams.set('tab', t);
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		replaceState(u, page.state);
	}

	// ── derived facts ─────────────────────────────────────────────────────────
	const offeneCount = $derived(data.rechnungen.filter((r) => !r.bezahltAm).length);
	const since = $derived.by(() => {
		if (data.rechnungen.length === 0) return null;
		const earliest = data.rechnungen.reduce(
			(min, r) => (r.rechnungsdatum < min ? r.rechnungsdatum : min),
			data.rechnungen[data.rechnungen.length - 1]!.rechnungsdatum
		);
		return new Date(earliest).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
	});
	const lastThree = $derived(data.rechnungen.slice(0, 3));
	const neueRechnungHref = $derived(`/app/rechnungen/new?customerId=${data.customer.id}`);

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	}
	function status(r: Rechnung): InvoiceRowStatus {
		return deriveInvoiceStatus(r.bezahltAm, r.faelligkeitsDatum, data.today);
	}
	function dateLabel(r: Rechnung): string {
		const s = status(r);
		if (s === 'bezahlt') return `Bezahlt ${fmtDate(r.bezahltAm)}`;
		if (r.faelligkeitsDatum) return `Fällig ${fmtDate(r.faelligkeitsDatum)}`;
		return 'ohne Zahlungsziel';
	}
	const CHIP: Record<InvoiceRowStatus, string> = {
		offen: 'bg-secondary text-ink-700',
		überfällig: 'bg-severity-warn-tint text-severity-warn-text',
		bezahlt: 'bg-type-einnahme-tint text-type-einnahme'
	};
	const CHIP_LABEL: Record<InvoiceRowStatus, string> = {
		offen: 'offen',
		überfällig: 'überfällig',
		bezahlt: 'bezahlt'
	};

	async function restore() {
		const fd = new FormData();
		fd.set('id', data.customer.id);
		await fetch('?/restore', { method: 'POST', body: fd });
		await invalidateAll();
		toast.info(`${data.customer.name} wiederhergestellt`);
	}
</script>

<svelte:head>
	<title>{data.customer.name} – Kunden – {page.data.vereinName}</title>
</svelte:head>

<PageShell width="list">
	<!-- breadcrumb -->
	<nav class="mb-4 flex items-center gap-2 text-sm text-ink-500" aria-label="Brotkrümel">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/kunden" class="inline-flex items-center gap-1 font-semibold text-ink-700 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" /></svg>
			Kunden
		</a>
		<svg class="h-3.5 w-3.5 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6" /></svg>
		<span class="truncate font-semibold text-ink-900">{data.customer.name}</span>
	</nav>

	<div class="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
		<!-- head -->
		<div class="p-5 sm:p-6">
			<CustomerDetailHero customer={data.customer} onEdit={() => (editOpen = true)} editDisabled={isArchived} />
		</div>

		{#if isArchived}
			<div class="mx-5 mb-5 flex flex-col gap-3 rounded-xl border border-border bg-muted px-4 py-3.5 sm:mx-6 sm:flex-row sm:items-center">
				<svg class="h-5 w-5 shrink-0 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" /><path stroke-linecap="round" stroke-linejoin="round" d="M7 11V7a5 5 0 0110 0v4" /></svg>
				<span class="flex-1 text-[13px] leading-relaxed text-ink-700">
					Archiviert am {fmtDate(data.customer.deletedAt)} — bleibt in alten Rechnungen sichtbar, nur aus der Liste raus.
				</span>
				<button
					type="button"
					onclick={restore}
					class="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-sm font-semibold text-ink-700 transition-colors hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<svg class="h-4 w-4 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8m0-5v5h5" /></svg>
					Wiederherstellen
				</button>
			</div>
		{/if}

		<!-- KPI ruler -->
		<div class="flex px-5 pb-5 sm:px-6">
			<div class="flex-1 pr-5 sm:pr-6">
				<div class="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Offen an uns</div>
				<div class="mt-1.5 text-2xl font-bold tracking-[-0.02em] text-open-ink tabular-nums" data-testid="kpi-offen">{formatMoney(data.kpi.offenCents)}</div>
				<div class="mt-1 text-[11.5px] text-ink-500">
					{#if offeneCount === 0}alles beglichen{:else}{offeneCount} offene {offeneCount === 1 ? 'Rechnung' : 'Rechnungen'}{/if}
				</div>
			</div>
			<div class="flex-1 border-l border-hairline pl-5 sm:pl-6">
				<div class="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Gesamt fakturiert</div>
				<div class="mt-1.5 text-2xl font-bold tracking-[-0.02em] text-ink-900 tabular-nums" data-testid="kpi-gesamt">{formatMoney(data.kpi.gesamtCents)}</div>
				<div class="mt-1 text-[11.5px] text-ink-500">
					{data.rechnungen.length} {data.rechnungen.length === 1 ? 'Rechnung' : 'Rechnungen'}{#if since}<span class="mx-1 text-ink-300">·</span>seit {since}{/if}
				</div>
			</div>
		</div>

		<!-- tabs -->
		<div class="flex gap-1 overflow-x-auto border-b border-border px-5 sm:px-6" role="tablist" aria-label="Kunden-Tabs">
			{#each TABS as tab (tab.id)}
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === tab.id}
					onclick={() => setTab(tab.id)}
					data-testid="tab-{tab.id}"
					class="relative whitespace-nowrap px-3.5 py-3 text-sm font-semibold transition-colors {activeTab === tab.id ? 'text-ink-900' : 'text-ink-500 hover:text-ink-700'}"
				>
					{tab.label}{#if tab.id === 'rechnungen' && data.rechnungen.length > 0}<span class="ml-1.5 text-ink-300">{data.rechnungen.length}</span>{/if}
					{#if activeTab === tab.id}<span class="absolute inset-x-3.5 -bottom-px h-0.5 rounded bg-gradient-brand"></span>{/if}
				</button>
			{/each}
		</div>

		<!-- panes -->
		<div class="p-5 sm:p-6">
			{#if activeTab === 'uebersicht'}
				<h2 class="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">Stammdaten</h2>
				<CustomerInfoCard customer={data.customer} onEditEmail={() => (editOpen = true)} canEdit={!isArchived} />

				<div class="mb-2 mt-6 flex items-center justify-between">
					<h2 class="text-[11px] font-bold uppercase tracking-wider text-ink-500">Letzte Rechnungen</h2>
					{#if data.rechnungen.length > 0}
						<button type="button" onclick={() => setTab('rechnungen')} class="text-xs font-semibold text-ink-500 hover:text-ink-900">Alle ansehen</button>
					{/if}
				</div>
				{#if lastThree.length === 0}
					<p class="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-ink-500">Noch keine Rechnung an {data.customer.name}.</p>
				{:else}
					<div class="flex flex-col gap-2">
						{#each lastThree as r (r.id)}
							{@render ledgerRow(r)}
						{/each}
					</div>
				{/if}
			{:else if activeTab === 'rechnungen'}
				<div class="mb-3 flex items-center justify-between gap-3">
					<h2 class="text-[11px] font-bold uppercase tracking-wider text-ink-500">Alle Rechnungen</h2>
					{#if isArchived}
						<span class="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-lg border border-border bg-muted px-3.5 text-sm font-semibold text-ink-300" title="Archivierte Kunden: keine neue Rechnung">
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5v14" /></svg>
							Rechnung
						</span>
					{:else}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href={neueRechnungHref} data-testid="neue-rechnung" class="inline-flex h-9 items-center gap-2 rounded-lg bg-primary-strong px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-strong/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5v14" /></svg>
							Rechnung
						</a>
					{/if}
				</div>
				{#if data.rechnungen.length === 0}
					<div class="grid place-items-center rounded-xl border border-dashed border-border bg-muted/40 px-6 py-12 text-center">
						<div class="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-brand-soft text-primary-text" aria-hidden="true">
							<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16h5M8 12h8M8 8h6M6 3h12a1 1 0 011 1v16a1 1 0 01-1.5.86l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1A1 1 0 015 20V4a1 1 0 011-1z" /></svg>
						</div>
						<h3 class="text-sm font-bold text-ink-900">Noch keine Rechnung an {data.customer.name} — die erste?</h3>
						<p class="mt-1 max-w-sm text-[13px] text-ink-500">Sobald du eine Rechnung stellst, taucht sie hier auf — mit Nummer, PDF und offener Summe.</p>
						{#if !isArchived}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href={neueRechnungHref} class="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary-strong px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-strong/90">
								<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M12 5v14" /></svg>
								Rechnung an {data.customer.name}
							</a>
						{/if}
					</div>
				{:else}
					<div class="flex flex-col gap-2">
						{#each data.rechnungen as r (r.id)}
							{@render ledgerRow(r)}
						{/each}
					</div>
					<div class="mt-3 flex items-center justify-between border-t-2 border-ink-900/80 px-1 pt-3 text-[13px] font-semibold text-ink-700">
						Offen an uns
						<span class="text-[15px] font-bold text-open-ink tabular-nums">{formatMoney(data.kpi.offenCents)}</span>
					</div>
				{/if}
			{:else if activeTab === 'projekte'}
				{#if data.projekte.length === 0}
					<p class="rounded-xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center text-sm text-ink-500">Keine Projekte mit {data.customer.name} als Standard-Kunde.</p>
				{:else}
					<div class="flex flex-col gap-2">
						{#each data.projekte as p (p.id)}
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href="/app/projekte/{p.id}" class="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-muted">
								<svg class="h-5 w-5 shrink-0 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
								<span class="font-mono text-xs text-ink-500">{p.businessId}</span>
								<span class="font-semibold text-ink-900">{p.name}</span>
							</a>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	</div>
</PageShell>

{#snippet ledgerRow(r: Rechnung)}
	{@const s = status(r)}
	<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
	<a href="/app/rechnungen/{r.id}" class="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-colors hover:bg-muted sm:grid-cols-[150px_1fr_auto_auto] sm:gap-4">
		<span class="inline-flex items-center gap-1.5 text-xs font-bold text-ink-900">
			<svg class="h-4 w-4 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16h5M8 12h8M8 8h6M6 3h12a1 1 0 011 1v16a1 1 0 01-1.5.86l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1A1 1 0 015 20V4a1 1 0 011-1z" /></svg>
			{r.businessId}
		</span>
		<span class="min-w-0">
			<span class="block truncate text-sm font-semibold text-ink-900">{r.bezeichnung}</span>
			<span class="block text-xs {s === 'überfällig' ? 'font-semibold text-severity-warn-text' : 'text-ink-500'}">{dateLabel(r)}</span>
		</span>
		<span class="inline-flex items-center gap-1 justify-self-end rounded-full px-2.5 py-0.5 text-[11px] font-semibold {CHIP[s]} max-sm:col-start-3 max-sm:row-start-1">{CHIP_LABEL[s]}</span>
		<span class="justify-self-end text-sm font-bold text-type-einnahme tabular-nums max-sm:col-start-3 max-sm:row-start-2">{formatMoney(r.bruttoCents)}</span>
	</a>
{/snippet}

<EditCustomerDialog bind:open={editOpen} customer={data.customer} />

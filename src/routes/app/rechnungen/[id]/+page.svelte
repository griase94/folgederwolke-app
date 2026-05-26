<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import InvoicePdfStatusBadge from '$lib/components/admin/invoices/InvoicePdfStatusBadge.svelte';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const inv = $derived(data.invoice);

	const bruttoFmt = $derived(
		(inv.bruttoCents / 100).toLocaleString('de-DE', {
			style: 'currency',
			currency: inv.currency,
			minimumFractionDigits: 2
		})
	);

	const datumFmt = $derived.by(() => {
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(inv.rechnungsdatum);
		return m ? `${m[3]}.${m[2]}.${m[1]}` : inv.rechnungsdatum;
	});

	let pollTimer: ReturnType<typeof setInterval> | null = $state(null);
	let polling = $state(false);

	function stopPolling(): void {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
		polling = false;
	}

	async function pollOnce(jobId: string): Promise<void> {
		try {
			const res = await fetch(`/api/jobs/${jobId}`);
			if (!res.ok) return;
			const body = (await res.json()) as { status: string };
			if (body.status === 'succeeded' || body.status === 'failed') {
				stopPolling();
				await invalidateAll();
			}
		} catch (err) {
			console.error('[rechnungen/:id] poll failed', err);
		}
	}

	onMount(() => {
		const jobId = data.pollJobId;
		const status = inv.pdfStatus;
		if (jobId && (status === 'queued' || status === 'running')) {
			polling = true;
			void pollOnce(jobId);
			pollTimer = setInterval(() => void pollOnce(jobId), 1000);
		}
	});

	onDestroy(() => stopPolling());

	const canRegenerate = $derived(
		inv.festgeschriebenAt === null && inv.supersededByBusinessId === null
	);
	const canSupersede = $derived(inv.supersededByBusinessId === null);
</script>

<svelte:head>
	<title>Rechnung {inv.businessId} - Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<div class="mb-6">
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href="/app/rechnungen"
			class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Zurück zu Rechnungen
		</a>
	</div>

	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<div>
			<div class="flex items-center gap-3">
				<h1 class="font-mono text-2xl font-bold tracking-tight text-foreground">
					{inv.businessId}
				</h1>
				<InvoicePdfStatusBadge pdfStatus={inv.pdfStatus} hasFile={inv.pdfFileId !== null} />
			</div>
			<p class="mt-1 text-sm text-muted-foreground">
				{inv.customerName} - {datumFmt}
			</p>
		</div>
		<div class="text-right">
			<div class="text-2xl font-semibold tabular-nums text-foreground">{bruttoFmt}</div>
			<div class="text-xs text-muted-foreground">Brutto</div>
		</div>
	</div>

	{#if data.predecessor}
		<div class="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
			Diese Rechnung ist eine Korrektur von
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="/app/rechnungen/{data.predecessor.id}" class="font-mono font-semibold underline">{data.predecessor.businessId}</a>.
		</div>
	{/if}
	{#if data.successor}
		<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
			Diese Rechnung wurde ersetzt durch
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="/app/rechnungen/{data.successor.id}" class="font-mono font-semibold underline">{data.successor.businessId}</a>.
		</div>
	{/if}

	{#if form && 'error' in form && form.error}
		<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
			{form.error}
		</div>
	{/if}

	{#if inv.pdfStatus === 'failed' && inv.pdfStatusError}
		<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
			PDF-Erstellung fehlgeschlagen: {inv.pdfStatusError}
		</div>
	{/if}

	<div class="rounded-xl border border-border bg-card p-6 shadow-sm">
		<h2 class="text-lg font-semibold text-foreground">{inv.bezeichnung}</h2>
		{#if inv.leistungsBeschreibung}
			<p class="mt-1 whitespace-pre-line text-sm text-muted-foreground">{inv.leistungsBeschreibung}</p>
		{/if}

		<dl class="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted-foreground">Kund:in</dt>
				<dd class="mt-0.5 font-medium">{inv.customerName}</dd>
				{#if inv.customerAddressSnapshot}
					<dd class="mt-1 whitespace-pre-line text-xs text-muted-foreground">{inv.customerAddressSnapshot}</dd>
				{/if}
			</div>
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted-foreground">Rechnungsdatum</dt>
				<dd class="mt-0.5 font-medium">{datumFmt}</dd>
			</div>
			{#if inv.leistungsDatum}
				<div>
					<dt class="text-xs uppercase tracking-wide text-muted-foreground">Leistungsdatum</dt>
					<dd class="mt-0.5 font-medium">{inv.leistungsDatum}</dd>
				</div>
			{/if}
			{#if inv.faelligkeitsDatum}
				<div>
					<dt class="text-xs uppercase tracking-wide text-muted-foreground">Faellig bis</dt>
					<dd class="mt-0.5 font-medium">{inv.faelligkeitsDatum}</dd>
				</div>
			{/if}
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted-foreground">Kategorie</dt>
				<dd class="mt-0.5 font-medium">{inv.kategorieNameSnapshot}</dd>
			</div>
			<div>
				<dt class="text-xs uppercase tracking-wide text-muted-foreground">Sphaere</dt>
				<dd class="mt-0.5 font-medium capitalize">{inv.sphereSnapshot}</dd>
			</div>
			{#if inv.projectName}
				<div>
					<dt class="text-xs uppercase tracking-wide text-muted-foreground">Projekt</dt>
					<dd class="mt-0.5 font-medium">{inv.projectName}</dd>
				</div>
			{/if}
		</dl>
	</div>

	<div class="mt-6 flex flex-wrap items-center gap-3">
		{#if inv.pdfFileId}
			<Button href={`/app/rechnungen/${inv.id}/pdf`} target="_blank" rel="noopener">
				<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
				</svg>
				PDF herunterladen
			</Button>
		{/if}

		{#if canRegenerate}
			<form method="POST" action="?/regenerate">
				<Button type="submit" variant="outline">
					<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
					PDF neu generieren
				</Button>
			</form>
		{/if}

		{#if inv.festgeschriebenAt && canSupersede}
			<form method="POST" action="?/supersede">
				<Button type="submit" variant="outline">Neu generieren (Korrektur)</Button>
			</form>
		{/if}

		{#if polling}
			<span class="inline-flex items-center gap-2 text-xs text-muted-foreground">
				<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-primary"></span>
				Aktualisiere Status ...
			</span>
		{/if}
	</div>
</div>

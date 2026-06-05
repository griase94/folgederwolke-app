<script lang="ts">
	import { goto } from '$app/navigation';
	import DetailModalShell from '$lib/components/admin/transactions/DetailModalShell.svelte';
	import BelegViewer from '$lib/components/files/BelegViewer.svelte';
	import EinnahmeDetailFields from '$lib/components/admin/transactions/einnahmen/EinnahmeDetailFields.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let dirty = $state(false);
	const saving = $state(false);

	const detail = $derived(data.detail);
	const hasBeleg = $derived(!!detail.belegFileId);

	function close() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- static parent-list route
		goto('/app/einnahmen');
	}
</script>

<svelte:head>
	<title>{detail.bezeichnung} – Einnahme</title>
</svelte:head>

{#snippet fields()}
	<EinnahmeDetailFields
		bezeichnung={detail.bezeichnung}
		betragCents={detail.betragCents}
		geldEingangDatum={null}
		kategorieNameSnapshot={detail.kategorieNameSnapshot}
		projectId={detail.projectId}
		kommentar={detail.kommentar}
		kategorien={data.kategorien}
		projects={data.projects}
		onDirty={() => (dirty = true)}
	/>
{/snippet}

{#snippet beleg()}
	{#if detail.belegFileId}
		<BelegViewer
			fileId={detail.belegFileId}
			mimeType={detail.belegMimeType ?? 'application/octet-stream'}
			originalFilename={detail.belegOriginalName ?? 'Beleg'}
			mode="inline"
		/>
	{/if}
{/snippet}

<!-- workflowAction is a READ-ONLY info slot (NOT an action button): when the
     income row was created by the shipped markInvoiceAsPaid flow it surfaces
     the "aus Rechnung FDW-…" context line; otherwise it renders nothing. -->
{#snippet workflowAction()}
	{#if detail.rechnungBusinessId}
		<span
			data-slot="aus-rechnung"
			class="mr-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground"
			title={`aus Rechnung ${detail.rechnungBusinessId}`}
		>
			<span aria-hidden="true">🔗</span>
			<span>aus Rechnung <span class="font-mono">{detail.rechnungBusinessId}</span></span>
		</span>
	{/if}
{/snippet}

<DetailModalShell
	{detail}
	isFestgeschrieben={data.isFestgeschrieben}
	{fields}
	beleg={hasBeleg ? beleg : undefined}
	workflowAction={detail.rechnungBusinessId ? workflowAction : undefined}
	{saving}
	{dirty}
	onClose={close}
/>

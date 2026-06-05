<script lang="ts">
	import { goto } from '$app/navigation';
	import LockIcon from '@lucide/svelte/icons/lock';
	import DetailModalShell from '$lib/components/admin/transactions/DetailModalShell.svelte';
	import SpendeDetailFields from '$lib/components/admin/transactions/spenden/SpendeDetailFields.svelte';
	import BelegViewer from '$lib/components/files/BelegViewer.svelte';
	import type { ActionData, PageData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let dirty = $state(false);
	let saving = $state(false);

	const errors = $derived((form?.errors as Record<string, string[]>) ?? {});

	const detail = $derived(data.detail);
	const isSach = $derived(detail.spendeKind === 'sachspende');
	// Bescheinigt OR festgeschrieben → read-only (shell hides Save). We feed the
	// shell `isFestgeschrieben` for either lock so the fields go inert + the
	// Speichern button is hidden once a Bescheinigung was issued, too.
	const issued = $derived(!!data.bescheinigungNr);
	const lockedReadOnly = $derived(data.isFestgeschrieben || issued);

	const bescheinigungHref = $derived(`/app/spenden/${detail.id}/zuwendungsbestaetigung`);

	function close() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- static app route
		goto('/app/spenden');
	}
</script>

<svelte:head>
	<title>{detail.bezeichnung} – Spenden</title>
</svelte:head>

{#snippet fields()}
	{#if issued && !data.isFestgeschrieben}
		<div
			data-testid="detail-bescheinigt-notice"
			class="mb-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
			role="note"
		>
			<LockIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<span>Bescheinigt — Storno + Neu-Erfassung (Phase 2)</span>
		</div>
	{/if}
	<SpendeDetailFields {detail} {errors} onDirty={() => (dirty = true)} />
	{#if form?.error}
		<p class="mt-3 text-sm text-red-600" data-testid="save-error">{form.error}</p>
	{/if}
{/snippet}

{#snippet beleg()}
	{#if detail.belegFileId}
		<div class="mb-3">
			<p class="mb-1 text-xs font-medium text-muted-foreground">Beleg / Kontoauszug</p>
			<BelegViewer
				fileId={detail.belegFileId}
				mimeType={detail.belegMimeType ?? 'application/octet-stream'}
				originalFilename={detail.belegOriginalName ?? 'Beleg'}
			/>
		</div>
	{/if}
	{#if isSach && detail.herkunftsbelegFileId}
		<div>
			<p class="mb-1 text-xs font-medium text-muted-foreground">Herkunftsbeleg</p>
			<!-- getTransactionDetail resolves mime/name only for the main Beleg; the
			     viewer's "Original öffnen" fallback handles the unknown-type case. -->
			<BelegViewer
				fileId={detail.herkunftsbelegFileId}
				mimeType="application/octet-stream"
				originalFilename="Herkunftsbeleg"
			/>
		</div>
	{/if}
{/snippet}

{#snippet workflowAction()}
	{#if issued}
		<span class="text-sm text-muted-foreground" data-testid="bescheinigung-nr-display">
			Bescheinigung <strong>{data.bescheinigungNr}</strong>
		</span>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- dynamic same-origin app route -->
		<a
			href={bescheinigungHref}
			data-testid="bescheinigung-view"
			class="inline-flex h-11 min-h-11 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-accent"
		>
			Bescheinigung anzeigen
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{:else if data.bescheinigungEnabled}
		<!-- eslint-disable svelte/no-navigation-without-resolve -- dynamic same-origin app route -->
		<a
			href={bescheinigungHref}
			data-testid="bescheinigung-erstellen"
			class="inline-flex h-11 min-h-11 items-center justify-center rounded-md border border-primary bg-background px-4 text-sm font-medium text-primary hover:bg-primary/10"
		>
			Bescheinigung erstellen
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{:else}
		<span
			data-testid="bescheinigung-disabled"
			title="Freistellungsbescheid fehlt in den Einstellungen"
			class="inline-flex h-11 min-h-11 cursor-not-allowed items-center justify-center rounded-md border border-border bg-muted px-4 text-sm font-medium text-muted-foreground/60"
		>
			Bescheinigung erstellen
		</span>
	{/if}
{/snippet}

<div class="container mx-auto max-w-5xl px-4 py-8 sm:px-6">
	<DetailModalShell
		{detail}
		isFestgeschrieben={lockedReadOnly}
		{fields}
		{beleg}
		{workflowAction}
		{saving}
		{dirty}
		onClose={close}
	/>
</div>

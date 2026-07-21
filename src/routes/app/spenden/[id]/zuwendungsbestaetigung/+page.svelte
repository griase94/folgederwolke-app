<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import BescheinigungsPreview from '$lib/components/admin/spenden/BescheinigungsPreview.svelte';
	import { toast } from 'svelte-sonner';

	let { data, form } = $props();

	let submitting = $state(false);

	$effect(() => {
		if (form?.action === 'generate' && form?.success) {
			toast.success(`Bescheinigung ${form.bescheinigungNr} ausgestellt`);
		}
	});

	function pdfUrl(): string {
		return `/app/spenden/${data.spende.id}/zuwendungsbestaetigung/pdf`;
	}
</script>

<svelte:head>
	<title>Zuwendungsbest&auml;tigung &middot; folgederwolke</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-6 sm:px-6">
	<div class="mb-4 flex items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Zuwendungsbest&auml;tigung</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Spende {data.spende.businessId} &middot; {data.spende.spendeKind === 'sachspende'
					? 'Sachspende'
					: 'Geldspende'}
			</p>
		</div>
		<Button variant="outline" href={`/app/spenden/${data.spende.id}`}>Zur&uuml;ck</Button>
	</div>

	{#if !data.bescheinigungEnabled}
		<div
			class="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
			role="status"
			data-testid="bescheinigung-disabled-banner"
		>
			<p class="font-medium">Bescheinigung kann nicht generiert werden</p>
			<p class="mt-1">
				Freistellungsbescheid fehlt in den Einstellungen
				(<code>VEREIN_BESCHEID_TYP</code>, <code>VEREIN_BESCHEID_DATUM</code>).
			</p>
		</div>
	{/if}

	{#if data.spende.festgeschriebenAt && !data.alreadyIssued}
		<!-- ADR-0006 Nachtrag (certificate carve-out): issuing is allowed in a
		     festgeschriebenes Jahr — it writes only the Bescheinigungs-Metadaten,
		     never a booking value. Honest hint, not a lock. -->
		<div
			class="mb-4 rounded-xl border border-[color:var(--sev-info)]/30 bg-[color:var(--sev-info)]/10 px-4 py-3 text-sm text-ink-700"
			role="status"
			data-testid="bescheinigung-festgeschrieben-hint"
		>
			Das Buchungsjahr ist festgeschrieben. Die Bescheinigung vergibt nur die
			Nummer und das Ausstellungsdatum &ndash; sie &auml;ndert keine
			Buchungswerte der Spende.
		</div>
	{/if}

	{#if data.extractError}
		<div class="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
			{data.extractError}
		</div>
	{/if}

	{#if form?.action === 'generate' && form?.error}
		<div class="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
			{form.error}
		</div>
	{/if}

	{#if data.preview}
		<BescheinigungsPreview preview={data.preview} />
	{/if}

	<div class="mt-6 flex flex-wrap items-center justify-end gap-3">
		{#if data.alreadyIssued}
			<span class="text-sm text-muted-foreground" data-testid="bescheinigung-nr-display">
				Ausgestellt: <strong>{data.spende.bescheinigungNr}</strong> am
				{data.spende.bescheinigungAusgestelltAm}
			</span>
			<Button href={pdfUrl()} data-testid="download-bescheinigung-pdf">PDF herunterladen</Button>
		{:else}
			<form
				method="POST"
				action="?/generate"
				use:enhance={() => {
					submitting = true;
					return async ({ result, update }) => {
						submitting = false;
						await update();
						await invalidateAll();
						if (result.type === 'success') {
							// trigger download in new tab
							window.open(pdfUrl(), '_blank', 'noopener');
						}
					};
				}}
			>
				<Button
					type="submit"
					disabled={submitting || !data.bescheinigungEnabled}
					data-testid="issue-bescheinigung-btn"
				>
					{submitting ? 'Wird ausgestellt&hellip;' : 'Bescheinigung ausstellen'}
				</Button>
			</form>
		{/if}
	</div>
</div>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import EntryFormShell from '$lib/components/admin/transactions/EntryFormShell.svelte';
	import SpendeFields from '$lib/components/admin/transactions/spenden/SpendeFields.svelte';
	import SpendenListView from '../SpendenListView.svelte';
	import { listQueryString } from '$lib/domain/transaction-filters.js';
	import type { ActionData, PageData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let dirty = $state(false);
	let gate = $state<{ ok: boolean; text: string } | undefined>(undefined);
	// EntryFormShell flips `submitting` on the form's submit event (same tick the
	// POST begins) so its beforeNavigate guard skips on a SUCCESSFUL create redirect
	// (no spurious "unsaved changes" prompt) AND the Speichern button disables to
	// block a double-submit. The shell also defaults its `enctype` to
	// multipart/form-data, so the optional Beleg / Sachspende Herkunftsbeleg (§4.3
	// prüfungssicherer Nachweis) file inputs transmit their bytes.
	let submitting = $state(false);

	// Re-hydrate after a failed submit (fail() carries values + errors).
	const values = $derived((form?.values as Record<string, unknown>) ?? {});
	const errors = $derived((form?.errors as Record<string, string[]>) ?? {});

	function close() {
		// Kulisse stage continuity: replay the list query so closing returns to the
		// exact list the user opened from (prefill keys dropped by listQueryString).
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same-origin list route + query
		goto(`/app/spenden${listQueryString('spenden', $page.url.searchParams)}`);
	}
</script>

<svelte:head>
	<title>Neue Spende – {$page.data.vereinName}</title>
</svelte:head>

{#snippet fields()}
	<SpendeFields
		members={data.members}
		projects={data.projects}
		anlageGemZeilen={data.anlageGemZeilen}
		{values}
		{errors}
		onDirty={() => (dirty = true)}
		onGate={(g) => (gate = g)}
	/>
	{#if form?.error}
		<p class="mt-3 text-sm text-red-600" data-testid="create-error">{form.error}</p>
	{/if}
{/snippet}

<!-- Kulisse: the real Spenden list is the inert stage behind the dialog. -->
<div inert aria-hidden="true" data-slot="entry-kulisse">
	<SpendenListView data={data.list} />
</div>

<EntryFormShell
	title="Neue Spende"
	statusHint="Zuwendung an den Verein · Jahr {data.year}"
	action="?/create"
	submitLabel="Spende anlegen"
	accent="spende"
	bind:submitting
	{dirty}
	{fields}
	onClose={close}
	gateStatus={gate}
/>

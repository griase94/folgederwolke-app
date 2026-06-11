<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import EntryFormShell from '$lib/components/admin/transactions/EntryFormShell.svelte';
	import SpendeFields from '$lib/components/admin/transactions/spenden/SpendeFields.svelte';
	import type { ActionData, PageData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let dirty = $state(false);
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
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- static app route
		goto('/app/spenden');
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
	/>
	{#if form?.error}
		<p class="mt-3 text-sm text-red-600" data-testid="create-error">{form.error}</p>
	{/if}
{/snippet}

<EntryFormShell
	title="Neue Spende"
	action="?/create"
	submitLabel="Speichern"
	bind:submitting
	{dirty}
	{fields}
	onClose={close}
/>

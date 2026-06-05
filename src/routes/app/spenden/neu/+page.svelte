<script lang="ts">
	import { goto } from '$app/navigation';
	import EntryFormShell from '$lib/components/admin/transactions/EntryFormShell.svelte';
	import SpendeFields from '$lib/components/admin/transactions/spenden/SpendeFields.svelte';
	import type { ActionData, PageData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let dirty = $state(false);
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
	<title>Neue Spende – Folge der Wolke</title>
</svelte:head>

{#snippet fields()}
	<SpendeFields
		members={data.members}
		projects={data.projects}
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
	{submitting}
	{dirty}
	{fields}
	onClose={close}
/>

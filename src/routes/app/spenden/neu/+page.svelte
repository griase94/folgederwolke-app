<script lang="ts">
	import { onMount } from 'svelte';
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

	// EntryFormShell owns the `<form id="entry-form">` and (on the current base)
	// renders it without an enctype, so the optional Beleg / Sachspende
	// Herkunftsbeleg (§4.3 prüfungssicherer Nachweis) file inputs are silently
	// dropped on a urlencoded POST. Per-page mitigation until EntryFormShell
	// grows an enctype prop on the base: set it on the rendered form element +
	// flip `submitting` on submit so EntryFormShell's beforeNavigate guard skips
	// on a SUCCESSFUL create redirect (no spurious "unsaved changes" prompt).
	onMount(() => {
		const formEl = document.getElementById('entry-form');
		if (!(formEl instanceof HTMLFormElement)) return;
		// Fix 3: file uploads need multipart encoding.
		formEl.enctype = 'multipart/form-data';
		// Fix 4: mark in-flight so the dirty-guard does not fire on the redirect.
		const onSubmit = () => {
			submitting = true;
		};
		formEl.addEventListener('submit', onSubmit);
		return () => formEl.removeEventListener('submit', onSubmit);
	});

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

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import EntryFormShell from '$lib/components/admin/transactions/EntryFormShell.svelte';
	import EinnahmeFields from '$lib/components/admin/transactions/einnahmen/EinnahmeFields.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// The EntryFormShell owns the <form id="entry-form"> + the Speichern submit;
	// the tab tracks `dirty` (gates Speichern + the unsaved-changes guard) and
	// passes the fields snippet.
	let dirty = $state(false);
	// `submitting` flips true on submit so the shell's beforeNavigate guard
	// early-returns on the SUCCESSFUL create-redirect (no spurious
	// "unsaved changes" prompt). A native POST ending in 303 navigates away.
	let submitting = $state(false);

	onMount(() => {
		// The shared EntryFormShell now defaults its <form> enctype to
		// multipart/form-data, so the optional Beleg bytes transmit. This page
		// only flips `submitting` on submit so the success redirect doesn't trip
		// the dirty-guard.
		const form = document.getElementById('entry-form');
		if (form instanceof HTMLFormElement) {
			form.addEventListener('submit', () => {
				submitting = true;
			});
		}
	});

	function close() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- static parent-list route
		goto('/app/einnahmen');
	}
</script>

<svelte:head>
	<title>Neue Einnahme – {$page.data.vereinName}</title>
</svelte:head>

{#snippet fields()}
	<EinnahmeFields
		kategorien={data.kategorien}
		projects={data.projects}
		initialProjectId={data.initialProjectId}
		onDirty={() => (dirty = true)}
	/>
{/snippet}

<EntryFormShell
	title="Neue Einnahme"
	action="?/create"
	submitLabel="Speichern"
	{submitting}
	{dirty}
	{fields}
	onClose={close}
/>

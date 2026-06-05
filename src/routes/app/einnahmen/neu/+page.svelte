<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
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
		// MITIGATION (review HIGH): the shared EntryFormShell <form> has no
		// `enctype`, so the browser defaults to application/x-www-form-urlencoded
		// and the optional Beleg file bytes never transmit (the server's
		// `instanceof File && size>0` guard would be false). Force the rendered
		// form to multipart so the Beleg actually uploads. The proper fix is an
		// EntryFormShell `enctype` prop on the base (tracked separately).
		const form = document.getElementById('entry-form');
		if (form instanceof HTMLFormElement) {
			form.enctype = 'multipart/form-data';
			// Flip `submitting` on submit so the redirect doesn't trip the guard.
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
	<title>Neue Einnahme – Folge der Wolke</title>
</svelte:head>

{#snippet fields()}
	<EinnahmeFields
		kategorien={data.kategorien}
		projects={data.projects}
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

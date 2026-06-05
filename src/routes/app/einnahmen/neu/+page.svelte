<script lang="ts">
	import { goto } from '$app/navigation';
	import EntryFormShell from '$lib/components/admin/transactions/EntryFormShell.svelte';
	import EinnahmeFields from '$lib/components/admin/transactions/einnahmen/EinnahmeFields.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// The EntryFormShell owns the <form> + the Speichern submit; the tab tracks
	// `dirty` (gates Speichern + the unsaved-changes guard) and passes the fields
	// snippet. A successful ?/create redirects (303) so the page navigates away;
	// `submitting` stays false for the native POST (no enhance on the shared shell).
	let dirty = $state(false);

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
	submitting={false}
	{dirty}
	{fields}
	onClose={close}
/>

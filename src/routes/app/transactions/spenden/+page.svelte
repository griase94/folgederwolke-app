<script lang="ts">
	import SpendenList from '$lib/components/admin/spenden/SpendenList.svelte';
	import AddSpendeDialog from '$lib/components/admin/spenden/AddSpendeDialog.svelte';
	import EditSpendeDialog from '$lib/components/admin/spenden/EditSpendeDialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	let addOpen = $state(false);
	let editOpen = $state(false);
	let editing = $state<(typeof data.spenden)[number] | null>(null);

	function onEdit(s: (typeof data.spenden)[number]) {
		editing = s;
		editOpen = true;
	}

	$effect(() => {
		if (!data.bescheinigungEnabled) {
			// One-time soft warning - persistent banner shown in list too.
		}
	});

	function onAddSuccess() {
		toast.success('Spende angelegt');
	}
	function onEditSuccess() {
		toast.success('Spende aktualisiert');
	}
</script>

<svelte:head>
	<title>Spenden &middot; folgederwolke</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<div class="mb-6 flex items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-semibold tracking-tight">Spenden</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Geld- und Sachspenden verwalten und Zuwendungsbest&auml;tigungen ausstellen.
			</p>
		</div>
		<Button onclick={() => (addOpen = true)} data-testid="add-spende-btn">
			Neue Spende
		</Button>
	</div>

	{#if !data.bescheinigungEnabled}
		<div
			class="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
			role="status"
			data-testid="bescheinigung-disabled-banner"
		>
			<p class="font-medium">Zuwendungsbest&auml;tigungen deaktiviert</p>
			<p class="mt-1">
				Bescheinigung kann nicht generiert werden &mdash; Freistellungsbescheid fehlt in den
				Einstellungen.
			</p>
		</div>
	{/if}

	<div
		class="mb-4 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
		data-testid="aufwandsspende-note"
	>
		<strong class="font-medium text-foreground">Aufwandsspende-Workflow in Vorbereitung.</strong>
		Die manuelle Erfassung mit Verzicht auf Auslagenerstattung wird in Phase 2 freigeschaltet.
	</div>

	<SpendenList
		spenden={data.spenden}
		bescheinigungEnabled={data.bescheinigungEnabled}
		{onEdit}
		onAdd={() => (addOpen = true)}
	/>
</div>

<AddSpendeDialog
	bind:open={addOpen}
	kategorien={data.kategorien}
	members={data.members}
	projects={data.projects}
	onSuccess={onAddSuccess}
/>

<EditSpendeDialog
	bind:open={editOpen}
	spende={editing}
	kategorien={data.kategorien}
	members={data.members}
	projects={data.projects}
	onSuccess={onEditSuccess}
/>

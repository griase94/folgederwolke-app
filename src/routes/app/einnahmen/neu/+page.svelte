<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import EntryFormShell from '$lib/components/admin/transactions/EntryFormShell.svelte';
	import EinnahmeFields from '$lib/components/admin/transactions/einnahmen/EinnahmeFields.svelte';
	import EinnahmenListView from '../EinnahmenListView.svelte';
	import type { EinnahmeFormValues } from './+page.server.js';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The EntryFormShell owns the <form id="entry-form"> + the Speichern submit;
	// the tab tracks `dirty` (gates Speichern + the unsaved-changes guard) and
	// passes the fields snippet.
	let dirty = $state(false);
	let gate = $state<{ ok: boolean; text: string } | undefined>(undefined);
	// `submitting` flips true on submit (via EntryFormShell's onSubmit) so the
	// shell's beforeNavigate guard early-returns on the SUCCESSFUL create-redirect
	// (no spurious "unsaved changes" prompt) AND the Speichern button disables in
	// the same tick to block a double-submit. A native POST ending in 303 navigates
	// away.
	let submitting = $state(false);

	// On a failed submit the action echoes the typed values + per-field errors so
	// the form re-hydrates (Ausgaben/Spenden parity); otherwise we seed from the
	// load's empty values. Both branches carry the same `EinnahmeFormValues` shape.
	const formValues = $derived(
		((form && 'values' in form ? form.values : undefined) ??
			data.values) as EinnahmeFormValues
	);
	const fieldErrors = $derived(
		form && 'errors' in form
			? (form.errors as Record<string, string[]> | undefined)
			: undefined
	);

	function close() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- static parent-list route
		goto('/app/einnahmen');
	}
</script>

<svelte:head>
	<title>Neue Einnahme – {$page.data.vereinName}</title>
</svelte:head>

{#snippet fields()}
	{#if form?.error}
		<div
			class="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
			role="alert"
		>
			{form.error}
		</div>
	{/if}
	<EinnahmeFields
		kategorien={data.kategorien}
		projects={data.projects}
		initialProjectId={data.initialProjectId}
		values={formValues}
		errors={fieldErrors}
		onDirty={() => (dirty = true)}
		onGate={(g) => (gate = g)}
	/>
{/snippet}

<!-- Kulisse: the real Einnahmen list is the inert stage behind the dialog. -->
<div inert aria-hidden="true" data-slot="entry-kulisse">
	<EinnahmenListView data={data.list} />
</div>

<EntryFormShell
	title="Neue Einnahme"
	statusHint="Geld, das der Verein eingenommen hat · Jahr {data.year}"
	action="?/create"
	submitLabel="Einnahme anlegen"
	accent="einnahme"
	bind:submitting
	{dirty}
	{fields}
	onClose={close}
	gateStatus={gate}
/>

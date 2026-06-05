<script lang="ts">
	/**
	 * /app/ausgaben/neu — Ausgabe entry (Phase 4, Task 4).
	 *
	 * Renders the Ausgaben `AusgabeFields` inside the shared `EntryFormShell`.
	 * The shell owns the sticky header/footer, the single Speichern button, and
	 * the unsaved-changes guard (fires identically on × / backdrop / browser-back
	 * while `dirty`). This page owns: the dirty flag, the submitting flag, the
	 * onClose navigation back to the list, and — because the shell's `<form>` has
	 * no `enctype` prop — setting `enctype="multipart/form-data"` on the shell
	 * form element on mount so the Beleg file uploads correctly (the shell stays
	 * read-only; we only set an attribute on its already-rendered form).
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import EntryFormShell from '$lib/components/admin/transactions/EntryFormShell.svelte';
	import AusgabeFields from '$lib/components/admin/transactions/ausgaben/AusgabeFields.svelte';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let dirty = $state(false);
	let submitting = $state(false);

	function onClose() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto('/app/ausgaben');
	}

	onMount(() => {
		// The shared EntryFormShell form has no enctype prop; set it on the
		// already-rendered form so the Beleg file field transmits as multipart.
		const formEl = document.getElementById('entry-form') as HTMLFormElement | null;
		if (formEl) {
			formEl.enctype = 'multipart/form-data';
			// Native submit → flip submitting so the shell disables Speichern + skips
			// the dirty-guard for the form navigation.
			formEl.addEventListener('submit', () => {
				submitting = true;
			});
		}
	});
</script>

<svelte:head>
	<title>Neue Ausgabe – Folge der Wolke</title>
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
	<AusgabeFields
		members={data.members}
		expenseKategorien={data.expenseKategorien}
		zahlungsarten={data.zahlungsarten}
		projects={data.projects}
		defaultKategorie={data.defaultExpenseKategorie ?? ''}
		prefillProjectId={data.prefillProjectId}
		onDirty={() => (dirty = true)}
	/>
{/snippet}

<EntryFormShell
	title="Neue Ausgabe"
	action="?/create"
	submitLabel="Ausgabe anlegen"
	{submitting}
	{dirty}
	{fields}
	{onClose}
/>

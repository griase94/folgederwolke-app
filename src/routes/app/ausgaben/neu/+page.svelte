<script lang="ts">
	/**
	 * /app/ausgaben/neu — Ausgabe entry (Phase 4, Task 4).
	 *
	 * Renders the Ausgaben `AusgabeFields` inside the shared `EntryFormShell`.
	 * The shell owns the sticky header/footer, the single Speichern button, and
	 * the unsaved-changes guard (fires identically on × / backdrop / browser-back
	 * while `dirty`). This page owns: the dirty flag, the submitting flag, the
	 * onClose navigation back to the list. The shell now owns the
	 * `enctype="multipart/form-data"` (its `enctype` prop defaults to it) so the
	 * Beleg file uploads correctly — this page only flips `submitting` on submit.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import EntryFormShell from '$lib/components/admin/transactions/EntryFormShell.svelte';
	import AusgabeFields from '$lib/components/admin/transactions/ausgaben/AusgabeFields.svelte';
	import type { AusgabeFormValues } from './+page.server.js';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let dirty = $state(false);
	let submitting = $state(false);

	// On a failed submit the action echoes the typed values + per-field errors so
	// the form re-hydrates (Fix 2); otherwise we seed from the load prefill (Fix 1,
	// the duplicate-as-template query). The 422 echo wins when present. Both
	// branches carry the same `AusgabeFormValues` shape.
	const formValues = $derived(
		((form && 'values' in form ? form.values : undefined) ??
			data.values) as AusgabeFormValues,
	);
	const fieldErrors = $derived(
		form && 'errors' in form
			? (form.errors as Record<string, string[]> | undefined)
			: undefined,
	);

	function onClose() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto('/app/ausgaben');
	}

	onMount(() => {
		// Native submit → flip submitting so the shell disables Speichern + skips
		// the dirty-guard for the form navigation. (Enctype is owned by the shell.)
		const formEl = document.getElementById('entry-form') as HTMLFormElement | null;
		if (formEl) {
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
		values={formValues}
		errors={fieldErrors}
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

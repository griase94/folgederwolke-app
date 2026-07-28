<script lang="ts">
	import { page } from '$app/state';
	import AuslagenForm from '$lib/components/forms/AuslagenForm.svelte';
	import SplitCardShell from '$lib/components/public/SplitCardShell.svelte';
	import TrustJourney from '$lib/components/public/TrustJourney.svelte';
	import Callout from '$lib/components/public/Callout.svelte';
	import Info from '@lucide/svelte/icons/info';
	import type { PageData, ActionData } from './$types.js';

	// The batch action returns fail() with a page-level `error` plus per-field
	// error maps (identity + item, keyed by client_key). Until the generated
	// ActionData narrows, we shape it as a loose intersection.
	type FormShape =
		| (ActionData & {
				error?: string;
				formErrors?: string[];
				identityErrors?: Record<string, string[]>;
				itemErrors?: Record<string, Record<string, string[]>>;
		  })
		| null
		| undefined;
	let { data, form }: { data: PageData; form: FormShape } = $props();

	const journeySteps = [
		{ title: 'Du reichst ein', subtitle: 'Beleg, Betrag, was es war — in zwei Minuten.' },
		{ title: 'Julia prüft', subtitle: 'Der Vorstand schaut kurz drüber.' },
		{ title: 'Geld kommt zurück', subtitle: 'Erstattung aufs Konto, meist 1–2 Wochen.' }
	];
</script>

<svelte:head>
	<title>Auslage einreichen — {page.data.vereinName}</title>
	<meta
		name="description"
		content="Auslagen-Erstattung für {page.data.vereinName} — Beleg einreichen und Erstattung erhalten."
	/>
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

{#if data.formEnabled === false}
	<main class="mx-auto max-w-xl px-4 py-16 text-center" data-testid="auslage-form-disabled-fallback">
		<h1 class="mb-3 text-2xl font-bold tracking-tight text-ink-900">Vorübergehend nicht verfügbar</h1>
		<p class="leading-relaxed text-ink-500">
			Das Auslagen-Formular ist gerade nicht aktiv. Bitte schreibe deinen Vorstand direkt an
			<a class="underline" href="mailto:{page.data.kontaktEmail ?? 'folgederwolke@gmail.com'}">{page.data.kontaktEmail ?? 'folgederwolke@gmail.com'}</a>
			oder versuche es später erneut.
		</p>
	</main>
{:else}
	<main class="mx-auto w-full max-w-5xl px-3 py-6 lg:px-6 lg:py-10">
		<SplitCardShell>
			{#snippet aside()}
				<div>
					<span class="text-[11px] font-bold tracking-wide text-ink-500 uppercase">Auslage einreichen</span>
					<h1 class="mt-3 text-[28px] leading-[1.06] font-extrabold tracking-tight text-ink-900">
						Vorgestreckt?<br />Kriegst zurück.
					</h1>
					<p class="mt-3.5 max-w-[34ch] text-[14.5px] leading-relaxed text-ink-500">
						Du hast was für den Verein bezahlt — reich's hier ein. Wir überweisen dir das Geld zurück,
						meist in ein, zwei Wochen.
					</p>
				</div>
				<div class="mt-auto hidden lg:block">
					<TrustJourney steps={journeySteps} doneUntil={0} trust="Verschlüsselt direkt an den Vorstand." />
				</div>
			{/snippet}
			{#snippet main()}
				{#if data.sharePrefill}
					<Callout
						class="mb-5"
						tone="brand"
						title="Aus dem Teilen-Menü übernommen."
						subtitle="Wir haben Bezeichnung und Kommentar schon eingetragen — schau nur kurz drüber."
						data-testid="share-prefill-banner"
					>
						{#snippet icon()}<Info />{/snippet}
					</Callout>
				{/if}
				<AuslagenForm
					projects={data.projects ?? []}
					maxBatchItems={data.maxBatchItems}
					serverError={form?.error ?? null}
					formErrors={form?.formErrors ?? null}
					identityErrors={form?.identityErrors ?? null}
					itemErrors={form?.itemErrors ?? null}
					initialBezeichnung={data.sharePrefill?.bezeichnung ?? ''}
					initialKommentar={data.sharePrefill?.kommentar ?? ''}
				/>
			{/snippet}
		</SplitCardShell>
	</main>
{/if}

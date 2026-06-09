<script lang="ts">
	import { page } from '$app/state';
	import AuslagenForm from '$lib/components/forms/AuslagenForm.svelte';
	import type { PageData, ActionData } from './$types.js';

	// `form` carries ActionData from the POST action. auto-fix-B's action returns
	// `fail(400, { error, errors })` where `errors` is a per-field
	// `Record<string, string[]>`. Until B's full type lands we shape it as a
	// loose intersection that surfaces both `error` (page-level) and `errors`
	// (per-field) into the form component.
	type FormShape =
		| (ActionData & { error?: string; errors?: Record<string, string[]> })
		| null
		| undefined;
	let { data, form }: { data: PageData; form: FormShape } = $props();
</script>

<svelte:head>
	<title>Auslage einreichen — {page.data.vereinName}</title>
	<meta
		name="description"
		content="Auslagen-Erstattung für {page.data.vereinName} — Beleg einreichen und Erstattung erhalten."
	/>
	<!-- viewport-fit=cover for iOS notch / safe-area support -->
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

{#if data.formEnabled === false}
	<!--
		B-2 soft-fallback: PUBLIC_FORM_ENABLED is off (or unset) so the form
		cannot accept submissions. We render a friendly 200 message instead of
		a 404 so misconfigured env state never costs us a share-target POST
		into the void. Form action remains gated server-side (returns 404).
	-->
	<main
		class="mx-auto max-w-xl px-4 py-16 text-center"
		data-testid="auslage-form-disabled-fallback"
	>
		<h1 class="mb-3 text-2xl font-bold tracking-tight">Vorübergehend nicht verfügbar</h1>
		<p class="text-muted-foreground leading-relaxed">
			Das Auslagen-Formular ist gerade nicht aktiv. Bitte schreibe deinen Vorstand
			direkt an
			<a class="underline" href="mailto:folgederwolke@gmail.com">folgederwolke@gmail.com</a>
			oder versuche es später erneut.
		</p>
	</main>
{:else}
	<main class="mx-auto max-w-xl px-4 py-8">
		<header class="mb-6">
			<h1 class="text-2xl font-bold tracking-tight">Auslage einreichen</h1>
			<p class="text-muted-foreground mt-2 text-sm leading-relaxed">
				Hier reichst du Auslagen ein, die du für den Verein gezahlt hast. Wir prüfen, importieren in
				unsere Buchhaltung und überweisen zurück. Eingangsbestätigung kommt direkt; Erstattung in der
				Regel innerhalb der nächsten Tage.
			</p>
			<p class="text-muted-foreground mt-2 text-sm">
				Pro Auslage: ein Kauf, ein Beleg. Bei mehreren Käufen oder Belegen bitte einzeln einreichen.
			</p>
		</header>

		{#if data.sharePrefill}
			<div
				role="status"
				data-testid="share-prefill-banner"
				class="mb-6 rounded-md border border-pink-200 bg-pink-50 p-4 text-sm text-pink-900"
			>
				<p class="font-medium">Aus dem Teilen-Menü übernommen</p>
				<p class="mt-1 leading-relaxed">
					Wir haben den Titel und Kommentar aus deiner Freigabe vorbefüllt. Bitte ergänze
					Betrag, Auszahlungsdetails (IBAN bzw. Mitglied) und Datenschutz-Zustimmung.
					{#if data.sharePrefill.fileNotice}
						<br />
						<strong>Hinweis:</strong> Der geteilte Beleg konnte aus technischen Gründen noch
						nicht übernommen werden — bitte unten erneut anhängen. (Folgt in einer späteren
						Version.)
					{/if}
				</p>
			</div>
		{/if}

		<AuslagenForm
			members={data.members ?? []}
			projects={data.projects ?? []}
			serverError={form?.error ?? null}
			serverFieldErrors={form?.errors ?? null}
			initialBezeichnung={data.sharePrefill?.bezeichnung ?? ''}
			initialKommentar={data.sharePrefill?.kommentar ?? ''}
		/>
	</main>
{/if}

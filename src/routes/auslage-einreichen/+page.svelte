<script lang="ts">
	import AuslagenForm from '$lib/components/forms/AuslagenForm.svelte';
	import OfflineBanner from '$lib/components/pwa/OfflineBanner.svelte';
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
	<title>Auslage einreichen — Folge der Wolke e.V.</title>
	<meta
		name="description"
		content="Auslagen-Erstattung für Folge der Wolke e.V. — Beleg einreichen und Erstattung erhalten."
	/>
	<!-- viewport-fit=cover for iOS notch / safe-area support -->
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<OfflineBanner />

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

	<AuslagenForm
		members={data.members ?? []}
		projects={data.projects ?? []}
		serverError={form?.error ?? null}
		serverFieldErrors={form?.errors ?? null}
	/>
</main>

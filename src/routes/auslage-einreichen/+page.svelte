<script lang="ts">
	import AuslagenForm from '$lib/components/forms/AuslagenForm.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
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

	<AuslagenForm members={data.members ?? []} projects={data.projects ?? []} />
</main>

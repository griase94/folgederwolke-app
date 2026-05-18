<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import type { LayoutData } from './$types.js';

	let { data }: { data: LayoutData } = $props();
</script>

<svelte:head>
	<title>Admin – Folge der Wolke</title>
</svelte:head>

<main class="container mx-auto max-w-2xl px-6 py-16">
	<h1 class="text-foreground mb-2 text-4xl font-bold tracking-tight">Folge der Wolke e.V.</h1>
	<p class="text-muted-foreground mb-8">
		Willkommen, {data.user.email}
	</p>

	<div class="mb-8 rounded-lg border p-6">
		<h2 class="mb-4 text-lg font-semibold">Verwaltung</h2>
		<p class="text-muted-foreground text-sm">
			Das Admin-Dashboard wird in Phase 2 aufgebaut. Hier entstehen Buchführung, Mitglieder,
			Einnahmen und Ausgaben.
		</p>
	</div>

	<form method="POST" action="/sign-out">
		<Button variant="outline" type="submit">Abmelden</Button>
	</form>
</main>

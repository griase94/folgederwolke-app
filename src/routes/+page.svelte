<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
</script>

<svelte:head>
	<title>Folge der Wolke</title>
</svelte:head>

<main class="container mx-auto max-w-2xl px-6 py-16">
	<h1 class="text-foreground mb-2 text-4xl font-bold tracking-tight">Folge der Wolke e.V.</h1>
	<p class="text-muted-foreground mb-8">Vereins-Verwaltung — Buchhaltung &amp; Mitglieder</p>

	<div class="flex gap-3">
		<Button>Auslage einreichen</Button>
		<Button variant="outline">Anmelden</Button>
	</div>
</main>

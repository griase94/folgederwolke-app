<script lang="ts">
	import type { PageData } from "./$types.js";
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Datenschutzerklärung – Folge der Wolke</title>
</svelte:head>

<main class="container mx-auto max-w-3xl px-6 py-12">
	<div
		class="bg-amber-50 border-amber-200 text-amber-900 mb-8 rounded-md border px-4 py-3 text-sm"
		role="note"
	>
		<strong>Hinweis:</strong> Diese Datenschutzerklärung ist in Vorarbeit
		({data.version}); sie wird vor öffentlichem Launch durch externe Prüfung finalisiert.
	</div>

	<article
		class="prose prose-zinc prose-headings:text-foreground prose-a:text-primary max-w-none"
	>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html data.html}
	</article>

	<p class="text-muted-foreground mt-12 text-xs">
		Version {data.version} · Folge der Wolke e.V.
	</p>
</main>

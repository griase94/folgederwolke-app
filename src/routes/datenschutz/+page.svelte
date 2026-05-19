<script lang="ts">
	import type { PageData } from "./$types.js";
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Datenschutzerklärung – Folge der Wolke</title>
</svelte:head>

<main class="container mx-auto max-w-3xl px-6 py-12">
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

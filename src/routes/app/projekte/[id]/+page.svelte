<script lang="ts">
	import ProjectInfoCard from '$lib/components/admin/projects/ProjectInfoCard.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.project.name} – Projekte – Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<!-- Breadcrumb -->
	<nav class="mb-4 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Brotkrümel">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/projekte" class="flex items-center gap-1 rounded hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Projekte
		</a>
		<span aria-hidden="true">/</span>
		<span class="truncate font-medium text-foreground">{data.project.name}</span>
	</nav>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
		<!-- Left: Info card -->
		<div class="lg:sticky lg:top-4 lg:self-start">
			<ProjectInfoCard project={data.project} />
		</div>

		<!-- Right: placeholder for linked transactions / expenses (future) -->
		<div class="flex flex-col gap-4">
			<div class="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
				<svg
					class="mx-auto mb-3 h-8 w-8 text-muted-foreground/40"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
				</svg>
				<p class="text-sm text-muted-foreground">
					Verknüpfte Ausgaben und Einnahmen werden in einem späteren Release angezeigt.
				</p>
			</div>
		</div>
	</div>
</div>

<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import ProjectList from '$lib/components/admin/projects/ProjectList.svelte';
	import AddProjectDialog from '$lib/components/admin/projects/AddProjectDialog.svelte';
	import EditProjectDialog from '$lib/components/admin/projects/EditProjectDialog.svelte';
	import type { ProjectView } from '$lib/server/domain/projects.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let addOpen = $state(false);
	let editOpen = $state(false);
	let editProject = $state<ProjectView | null>(null);

	let searchQuery = $state('');

	const filteredProjects = $derived(
		searchQuery.trim().length === 0
			? data.projects
			: data.projects.filter((p) => {
					const q = searchQuery.trim().toLowerCase();
					return (
						p.name.toLowerCase().includes(q) ||
						p.businessId.toLowerCase().includes(q) ||
						(p.notes?.toLowerCase().includes(q) ?? false)
					);
				})
	);

	function openEdit(p: ProjectView) {
		editProject = p;
		editOpen = true;
	}
</script>

<svelte:head>
	<title>Projekte – Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-8 sm:px-6">
	<!-- Header -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground">Projekte</h1>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Projekte & Events verwalten
			</p>
		</div>
		<Button
			onclick={() => (addOpen = true)}
			class="bg-primary text-primary-foreground hover:bg-primary/90"
		>
			<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			Projekt hinzufügen
		</Button>
	</div>

	<!-- Search -->
	<div class="mb-4">
		<div class="relative w-full sm:max-w-xs">
			<svg
				class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="8" />
				<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35" />
			</svg>
			<input
				type="search"
				placeholder="Suchen…"
				bind:value={searchQuery}
				aria-label="Projekte suchen"
				class="border-input focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent py-1 pl-8 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
			/>
		</div>
	</div>

	<!-- List -->
	<ProjectList projects={filteredProjects} onEdit={openEdit} />
</div>

<AddProjectDialog bind:open={addOpen} />
<EditProjectDialog bind:open={editOpen} project={editProject} />

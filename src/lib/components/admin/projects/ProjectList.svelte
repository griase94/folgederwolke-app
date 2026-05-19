<script lang="ts">
	import ProjectRow from './ProjectRow.svelte';
	import type { ProjectView } from '$lib/server/domain/projects.js';

	let {
		projects,
		onEdit
	}: {
		projects: ProjectView[];
		onEdit: (p: ProjectView) => void;
	} = $props();
</script>

{#if projects.length === 0}
	<div
		class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center"
	>
		<svg
			class="h-12 w-12 text-muted-foreground/50"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="1"
			aria-hidden="true"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
		</svg>
		<div>
			<p class="font-medium text-foreground">Noch keine Projekte</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Füge das erste Projekt mit dem Button oben hinzu.
			</p>
		</div>
	</div>
{:else}
	<div class="space-y-2" role="list" aria-label="Projektliste">
		{#each projects as project (project.id)}
			<div role="listitem">
				<ProjectRow {project} {onEdit} />
			</div>
		{/each}
	</div>
{/if}

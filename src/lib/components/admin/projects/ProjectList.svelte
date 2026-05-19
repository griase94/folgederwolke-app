<script lang="ts">
	import ProjectRow from './ProjectRow.svelte';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
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
	<NoEntries entity="Projekte" hint="Füge das erste Projekt mit dem Button oben hinzu." />
{:else}
	<div class="space-y-2" role="list" aria-label="Projektliste">
		{#each projects as project (project.id)}
			<div role="listitem">
				<ProjectRow {project} {onEdit} />
			</div>
		{/each}
	</div>
{/if}

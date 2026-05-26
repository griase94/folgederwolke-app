<script lang="ts">
	import ProjectRow from './ProjectRow.svelte';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type {
		ProjectFinancials,
		ProjectView,
	} from '$lib/server/domain/projects.js';

	let {
		projects,
		financialsMap = {},
		onEdit,
		onAdd
	}: {
		projects: ProjectView[];
		/** C1-PRJ-A: batched financials map keyed by project id — drives the saldo pill. */
		financialsMap?: Record<string, ProjectFinancials>;
		onEdit: (p: ProjectView) => void;
		/** Optional CTA — when provided the empty state renders an "anlegen" button. */
		onAdd?: () => void;
	} = $props();
</script>

{#if projects.length === 0}
	<NoEntries entity="Projekte" hint="Lege das erste Projekt an, um loszulegen.">
		{#snippet action()}
			{#if onAdd}
				<Button onclick={onAdd}>Projekt anlegen</Button>
			{/if}
		{/snippet}
	</NoEntries>
{:else}
	<div class="space-y-2" role="list" aria-label="Projektliste">
		{#each projects as project (project.id)}
			<div role="listitem">
				<ProjectRow
					{project}
					saldoCents={financialsMap[project.id]?.saldoCents ?? 0}
					{onEdit}
				/>
			</div>
		{/each}
	</div>
{/if}

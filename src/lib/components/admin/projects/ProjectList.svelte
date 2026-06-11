<script lang="ts">
	import ProjectRow from './ProjectRow.svelte';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
	import SearchNoResults from '$lib/components/empty/SearchNoResults.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type {
		ProjectFinancials,
		ProjectView,
	} from '$lib/server/domain/projects.js';

	let {
		projects,
		financialsMap = {},
		query = '',
		onEdit,
		onAdd,
		onClearSearch
	}: {
		projects: ProjectView[];
		/** C1-PRJ-A: batched financials map keyed by project id — drives the saldo pill. */
		financialsMap?: Record<string, ProjectFinancials>;
		/** Active search term — distinguishes "no data yet" from "no matches". */
		query?: string;
		onEdit: (p: ProjectView) => void;
		/** Optional CTA — when provided the empty state renders an "anlegen" button. */
		onAdd?: () => void;
		/** Clears the active search from the "Keine Treffer" state. */
		onClearSearch?: () => void;
	} = $props();

	const hasQuery = $derived(query.trim().length > 0);
</script>

{#if projects.length === 0 && hasQuery}
	<SearchNoResults {query} onClear={onClearSearch} />
{:else if projects.length === 0}
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

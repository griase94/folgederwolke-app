<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import EditProjectDialog from './EditProjectDialog.svelte';
	import type { ProjectView } from '$lib/server/domain/projects.js';

	let {
		project,
		customers = [],
	}: {
		project: ProjectView;
		/** C1-PRJ-A: forwarded into EditProjectDialog for the Default-Kunde combobox. */
		customers?: Array<{ id: string; name: string }>;
	} = $props();

	let editOpen = $state(false);

	const sphereLabel: Record<string, string> = {
		ideeller: 'Ideell',
		vermoegen: 'Vermögen',
		zweckbetrieb: 'Zweckbetrieb',
		wirtschaftlich: 'Wirtschaftlich'
	};

	function formatDate(d: string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('de-DE', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	const isArchived = $derived(!!project.deletedAt);
</script>

<Card.Root class="overflow-hidden">
	<div class="h-2 bg-gradient-to-r from-indigo-400 to-violet-500"></div>

	<Card.Content class="p-6">
		<!-- Icon + name -->
		<div class="mb-6 flex items-start gap-4">
			<div
				class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-800 shadow-sm"
				aria-hidden="true"
			>
				<svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
				</svg>
			</div>
			<div class="min-w-0 flex-1">
				<h2 class="truncate text-xl font-bold text-foreground">{project.name}</h2>
				<div class="mt-1 flex flex-wrap items-center gap-2">
					<span class="font-mono text-xs text-muted-foreground">{project.businessId}</span>
					{#if isArchived}
						<span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
							archiviert
						</span>
					{:else}
						<span class="inline-flex items-center rounded-full border border-green-200 bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
							aktiv
						</span>
					{/if}
					{#if project.isFixture}
						<span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
							Fixture
						</span>
					{/if}
				</div>
			</div>
		</div>

		<dl class="space-y-3">
			{#if project.sphereDefault}
				<div class="flex items-start gap-3">
					<dt class="flex w-28 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">Sphäre</dt>
					<dd class="text-sm font-medium text-foreground">
						{sphereLabel[project.sphereDefault] ?? project.sphereDefault}
					</dd>
				</div>
			{/if}

			{#if project.startDate || project.endDate}
				<div class="flex items-start gap-3">
					<dt class="flex w-28 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">Zeitraum</dt>
					<dd class="text-sm text-foreground">
						{formatDate(project.startDate)}{project.endDate ? ' – ' + formatDate(project.endDate) : ''}
					</dd>
				</div>
			{/if}

			{#if project.notes}
				<div class="flex items-start gap-3">
					<dt class="flex w-28 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">Notizen</dt>
					<dd class="min-w-0 flex-1 whitespace-pre-wrap text-sm text-foreground">{project.notes}</dd>
				</div>
			{/if}

			<div class="flex items-start gap-3">
				<dt class="flex w-28 shrink-0 items-center gap-1.5 text-sm text-muted-foreground">Angelegt</dt>
				<dd class="text-sm text-muted-foreground">{formatDate(project.createdAt)}</dd>
			</div>
		</dl>

		<div class="mt-6 border-t border-border pt-4">
			<Button
				variant="outline"
				class="w-full"
				onclick={() => (editOpen = true)}
				aria-label="Projekt bearbeiten"
			>
				<svg class="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
				</svg>
				Bearbeiten
			</Button>
		</div>
	</Card.Content>
</Card.Root>

<EditProjectDialog bind:open={editOpen} {project} {customers} />

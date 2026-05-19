<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import type { ProjectView } from '$lib/server/domain/projects.js';

	let {
		project,
		onEdit
	}: { project: ProjectView; onEdit: (p: ProjectView) => void } = $props();

	let dropdownOpen = $state(false);

	const sphereLabel: Record<string, string> = {
		ideeller: 'Ideell',
		vermoegen: 'Vermögen',
		zweckbetrieb: 'Zweckbetrieb',
		wirtschaftlich: 'Wirtschaftlich'
	};

	function formatDate(d: string | null): string {
		if (!d) return '';
		return new Date(d).toLocaleDateString('de-DE', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	const isArchived = $derived(!!project.deletedAt);
</script>

<div
	class="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-shadow hover:shadow-md {isArchived ? 'opacity-60' : ''}"
>
	<!-- Icon -->
	<div
		class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-800"
		aria-hidden="true"
	>
		<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
		</svg>
	</div>

	<!-- Name + meta -->
	<div class="min-w-0 flex-1">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/projekte/{project.id}" class="block truncate font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
			{project.name}
		</a>
		<div class="flex flex-wrap items-center gap-2 mt-0.5">
			<span class="text-xs text-muted-foreground font-mono">{project.businessId}</span>
			{#if project.sphereDefault}
				<span class="text-xs text-muted-foreground">· {sphereLabel[project.sphereDefault] ?? project.sphereDefault}</span>
			{/if}
			{#if project.startDate || project.endDate}
				<span class="text-xs text-muted-foreground">
					· {formatDate(project.startDate)}{project.endDate ? ' – ' + formatDate(project.endDate) : ''}
				</span>
			{/if}
			{#if isArchived}
				<span class="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">archiviert</span>
			{/if}
		</div>
	</div>

	<!-- Actions -->
	<DropdownMenu.Root bind:open={dropdownOpen}>
		<DropdownMenu.Trigger
			aria-label="Aktionen für {project.name}"
			class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<circle cx="12" cy="5" r="1.5" />
				<circle cx="12" cy="12" r="1.5" />
				<circle cx="12" cy="19" r="1.5" />
			</svg>
		</DropdownMenu.Trigger>

		<DropdownMenu.Content align="end" class="w-44">
			<DropdownMenu.Item
				onSelect={() => {
					dropdownOpen = false;
					onEdit(project);
				}}
			>
				<svg class="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
				</svg>
				Bearbeiten
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

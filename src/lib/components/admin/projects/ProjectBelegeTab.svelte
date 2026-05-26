<!-- src/lib/components/admin/projects/ProjectBelegeTab.svelte -->
<script lang="ts">
	type Beleg = {
		id: string;
		projectId: string; // P2-B7
		originalFilename: string;
		mimeType: string;
		byteSize: number;
		sourceKind: string;
		uploadedAt: string;
		viewUrl: string;
	};

	let { belege }: { belege: Beleg[] } = $props();

	function fmtSize(b: number) {
		if (b < 1024) return `${b} B`;
		if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
		return `${(b / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
{#if belege.length === 0}
	<div
		class="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-muted-foreground"
	>
		Keine Belege in diesem Projekt.
	</div>
{:else}
	<ul class="grid gap-2 sm:grid-cols-2">
		{#each belege as b (b.id)}
			<li
				class="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
				data-testid="project-beleg-row"
				data-project-id={b.projectId}
			>
				<div class="min-w-0 flex-1">
					<span class="block truncate font-medium">{b.originalFilename}</span>
					<span class="block text-xs text-muted-foreground"
						>{b.mimeType} · {fmtSize(b.byteSize)} · {b.sourceKind}</span
					>
				</div>
				<a
					href={b.viewUrl}
					target="_blank"
					rel="noopener"
					class="text-sm text-primary hover:underline">öffnen</a
				>
			</li>
		{/each}
	</ul>
{/if}

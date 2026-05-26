<!-- src/lib/components/admin/projects/ProjectVerlaufTab.svelte -->
<script lang="ts">
	type Event = {
		id: string;
		projectId: string; // P2-B7
		action: string;
		entityKind: string;
		entityId: string | null;
		actorDisplay: string;
		ts: string;
		payloadSummary: string;
	};

	let { events }: { events: Event[] } = $props();

	function fmt(ts: string) {
		return new Date(ts).toLocaleString("de-DE", {
			dateStyle: "medium",
			timeStyle: "short",
		});
	}
</script>

{#if events.length === 0}
	<div class="text-muted-foreground">Noch keine Aktivitäten.</div>
{:else}
	<ol class="relative ml-4 border-l border-border">
		{#each events as e (e.id)}
			<li
				class="mb-4 ml-4"
				data-testid="project-verlauf-event"
				data-ts={e.ts}
				data-project-id={e.projectId}
			>
				<div class="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary"></div>
				<time class="text-xs text-muted-foreground">{fmt(e.ts)}</time>
				<p class="text-sm">
					<strong>{e.action}</strong> · {e.entityKind} · {e.actorDisplay}
				</p>
				<p class="text-xs text-muted-foreground">{e.payloadSummary}</p>
			</li>
		{/each}
	</ol>
{/if}

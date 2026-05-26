<!-- src/lib/components/admin/dashboard/TopProjekteWidget.svelte -->
<script lang="ts">
	import SaldoPill from "$lib/components/admin/projects/SaldoPill.svelte";

	type Row = { id: string; name: string; businessId: string; saldoCents: number };
	let { rows }: { rows: Row[] } = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<section
	data-component="top-projekte-widget"
	class="rounded-xl border border-border bg-card p-4 shadow-sm dark:border-border/60 dark:bg-card/40"
>
	<header class="mb-3 flex items-baseline justify-between">
		<h2 class="text-base font-semibold">Top-Projekte</h2>
		<a href="/app/projekte" class="text-sm text-primary hover:underline">alle ansehen</a>
	</header>
	{#if rows.length === 0}
		<p class="text-sm text-muted-foreground">Keine aktiven Projekte.</p>
	{:else}
		<ul class="flex flex-col gap-1">
			{#each rows as r (r.id)}
				<li>
					<a
						href={`/app/projekte/${r.id}`}
						data-testid="top-projekte-row"
						class="flex items-center justify-between gap-3 rounded-md px-2 py-3 hover:bg-accent dark:hover:bg-accent/40"
					>
						<span class="min-w-0 truncate text-sm font-medium">{r.name}</span>
						<SaldoPill saldoCents={r.saldoCents} />
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>

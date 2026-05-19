<!--
  CardSkeleton — shimmer placeholder for detail/card views.
  Use in a detail page while loading data.
-->
<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
</script>

<div class="space-y-6" aria-busy="true" aria-label="Lädt…" role="status">
	<span class="sr-only">Inhalte werden geladen…</span>

	<!-- Header area -->
	<div class="flex items-start gap-4">
		<Skeleton class="h-12 w-12 shrink-0 rounded-full" />
		<div class="flex-1 space-y-2">
			<Skeleton class="h-6 w-48" />
			<Skeleton class="h-4 w-72" />
		</div>
	</div>

	<!-- Body fields -->
	<div class="rounded-xl border border-border bg-card divide-y divide-border">
		{#each [{ w: 'w-1/3' }, { w: 'w-1/2' }, { w: 'w-2/5' }, { w: 'w-1/4' }] as row, i (i)}
			<div class="flex items-center gap-4 px-6 py-4">
				<Skeleton class="h-3.5 w-24 shrink-0" />
				<Skeleton class="h-4 {row.w}" />
			</div>
		{/each}
	</div>

	<!-- Action bar -->
	<div class="flex gap-2">
		<Skeleton class="h-9 w-24 rounded-lg" />
		<Skeleton class="h-9 w-24 rounded-lg" />
	</div>
</div>

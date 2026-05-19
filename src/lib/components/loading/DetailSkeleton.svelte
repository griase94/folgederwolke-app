<!--
  DetailSkeleton — shimmer placeholder for detail/form pages with sections.
  Suitable for pages like Kunden/[id], Projekte/[id], Mitglieder/[id].
-->
<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
</script>

<div class="space-y-8" aria-busy="true" aria-label="Lädt…" role="status">
	<span class="sr-only">Seiteninhalt wird geladen…</span>

	<!-- Page title area -->
	<div class="flex items-center justify-between">
		<div class="space-y-2">
			<Skeleton class="h-7 w-52" />
			<Skeleton class="h-4 w-36" />
		</div>
		<Skeleton class="h-9 w-28 rounded-lg" />
	</div>

	<!-- Main info card -->
	<div class="rounded-xl border border-border bg-card p-6 space-y-4">
		<Skeleton class="h-5 w-32 mb-2" />
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			{#each [0, 1, 2, 3] as i (i)}
				<div class="space-y-1.5">
					<Skeleton class="h-3.5 w-20" />
					<Skeleton class="h-9 w-full rounded-lg" />
				</div>
			{/each}
		</div>
	</div>

	<!-- Secondary section -->
	<div class="rounded-xl border border-border bg-card p-6 space-y-4">
		<Skeleton class="h-5 w-40 mb-2" />
		<div class="space-y-2">
			{#each [0, 1, 2] as i (i)}
				<div class="flex items-center gap-4 rounded-lg border border-border px-4 py-3">
					<Skeleton class="h-8 w-8 rounded-full shrink-0" />
					<div class="flex-1 space-y-1.5">
						<Skeleton class="h-4 w-2/5" />
						<Skeleton class="h-3 w-1/2" />
					</div>
					<Skeleton class="h-5 w-16 rounded-full" />
				</div>
			{/each}
		</div>
	</div>
</div>

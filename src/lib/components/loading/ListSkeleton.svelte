<!--
  ListSkeleton — reusable shimmer placeholder for list/table pages.
  Renders `rows` number of skeleton rows. Each row mimics a typical
  admin list card: avatar-ish block + two lines of text + a chip.
-->
<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	let { rows = 5 }: { rows?: number } = $props();
</script>

<div class="space-y-2" aria-busy="true" aria-label="Lädt…" role="status">
	<span class="sr-only">Inhalte werden geladen…</span>
	{#each Array.from({ length: rows }, (_, i) => i) as i (i)}
		<div class="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
			<Skeleton class="h-10 w-10 shrink-0 rounded-full" />
			<div class="flex-1 space-y-1.5">
				<Skeleton class="h-4 w-2/5" />
				<Skeleton class="h-3 w-3/5" />
			</div>
			<div class="hidden gap-1.5 sm:flex">
				<Skeleton class="h-5 w-16 rounded-full" />
				<Skeleton class="h-5 w-12 rounded-full" />
			</div>
		</div>
	{/each}
</div>

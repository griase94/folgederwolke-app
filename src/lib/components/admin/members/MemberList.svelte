<script lang="ts">
	import MemberRow from './MemberRow.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
	import type { MemberView } from '$lib/domain/members.js';

	let {
		members,
		years,
		loading = false,
		onEdit
	}: {
		members: MemberView[];
		years: number[];
		loading?: boolean;
		onEdit: (m: MemberView) => void;
	} = $props();
</script>

{#if loading}
	<div class="space-y-2" aria-busy="true" aria-label="Lädt Mitgliederliste…">
		{#each [0, 1, 2, 3] as i (i)}
			<div class="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
				<Skeleton class="h-10 w-10 rounded-full" />
				<div class="flex-1 space-y-1.5">
					<Skeleton class="h-4 w-40" />
					<Skeleton class="h-3 w-56" />
				</div>
				<div class="hidden gap-1.5 sm:flex">
					<Skeleton class="h-5 w-16 rounded-full" />
					<Skeleton class="h-5 w-16 rounded-full" />
					<Skeleton class="h-5 w-16 rounded-full" />
				</div>
			</div>
		{/each}
	</div>
{:else if members.length === 0}
	<NoEntries entity="Mitglieder" hint="Füge das erste Mitglied mit dem Button oben hinzu." />
{:else}
	<div class="space-y-2" role="list" aria-label="Mitgliederliste">
		{#each members as member (member.id)}
			<div role="listitem">
				<MemberRow {member} {years} {onEdit} />
			</div>
		{/each}
	</div>
{/if}

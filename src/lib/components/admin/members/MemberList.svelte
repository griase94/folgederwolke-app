<script lang="ts">
	import MemberRow from './MemberRow.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
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
	<div
		class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center"
	>
		<svg
			class="h-12 w-12 text-muted-foreground/50"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="1"
			aria-hidden="true"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
			/>
		</svg>
		<div>
			<p class="font-medium text-foreground">Noch keine Mitglieder</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Füge das erste Mitglied mit dem Button oben hinzu.
			</p>
		</div>
	</div>
{:else}
	<div class="space-y-2" role="list" aria-label="Mitgliederliste">
		{#each members as member (member.id)}
			<div role="listitem">
				<MemberRow {member} {years} {onEdit} />
			</div>
		{/each}
	</div>
{/if}

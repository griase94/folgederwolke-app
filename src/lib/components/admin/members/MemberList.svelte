<script lang="ts">
	import MemberRow from './MemberRow.svelte';
	import MemberCardMobile from './MemberCardMobile.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
	import SearchNoResults from '$lib/components/empty/SearchNoResults.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { MemberView } from '$lib/domain/members.js';

	let {
		members,
		years,
		loading = false,
		query = '',
		selectable = false,
		selectedIds,
		onToggleSelect,
		onEdit,
		onAdd,
		onClearSearch
	}: {
		members: MemberView[];
		years: number[];
		loading?: boolean;
		/** Active search term — distinguishes "no data yet" from "no matches". */
		query?: string;
		/** Bulk-select mode — desktop rows render a leading checkbox. */
		selectable?: boolean;
		/** Set of selected member ids (reactive). */
		selectedIds?: ReadonlySet<string>;
		onToggleSelect?: (id: string, checked: boolean) => void;
		onEdit: (m: MemberView) => void;
		/** Optional CTA — when provided the empty state renders an "anlegen" button. */
		onAdd?: () => void;
		/** Clears the active search from the "Keine Treffer" state. */
		onClearSearch?: () => void;
	} = $props();

	const hasQuery = $derived(query.trim().length > 0);
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
{:else if members.length === 0 && hasQuery}
	<!-- A search simply matched nothing — not a first-run empty Verein. -->
	<SearchNoResults {query} onClear={onClearSearch} />
{:else if members.length === 0}
	<NoEntries entity="Mitglieder" hint="Lege das erste Mitglied an, um loszulegen.">
		{#snippet action()}
			{#if onAdd}
				<Button onclick={onAdd}>Mitglied anlegen</Button>
			{/if}
		{/snippet}
	</NoEntries>
{:else}
	<!--
		Mobile (< md): compact card variant — dropdown actions are removed since
		hover isn't a touch affordance; the whole card routes to the detail page
		where the same actions live (PM-009).
	-->
	<div
		data-testid="member-card-list"
		class="space-y-2 md:hidden"
		role="list"
		aria-label="Mitgliederliste"
	>
		{#each members as member (member.id)}
			<div role="listitem">
				<MemberCardMobile {member} {years} />
			</div>
		{/each}
	</div>

	<!-- Desktop (md+): full row with kebab actions + year beitrag chips -->
	<div
		data-testid="member-row-list"
		class="hidden space-y-2 md:block"
		role="list"
		aria-label="Mitgliederliste"
	>
		{#each members as member (member.id)}
			<div role="listitem">
				<MemberRow
					{member}
					{years}
					{onEdit}
					{selectable}
					selected={selectedIds?.has(member.id) ?? false}
					{onToggleSelect}
				/>
			</div>
		{/each}
	</div>
{/if}

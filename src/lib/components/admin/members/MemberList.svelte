<script lang="ts">
	import MemberRow from './MemberRow.svelte';
	import MemberCardMobile from './MemberCardMobile.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import NoEntries from '$lib/components/empty/NoEntries.svelte';
	import SearchNoResults from '$lib/components/empty/SearchNoResults.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { MemberView } from '$lib/domain/members.js';
	import { currentBuchungsjahr, clampYearToAvailable } from '$lib/domain/year.js';

	let {
		members,
		years,
		loading = false,
		query = '',
		selectable = false,
		selectedIds,
		bulkYear = null,
		satzByYear = {},
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
		/** The year the bulk "Als bezahlt" targets — gates each row's checkbox. */
		bulkYear?: number | null;
		/** Per-year configured Beitragssatz (cents) — seeds the mark-paid popover. */
		satzByYear?: Record<number, number>;
		onToggleSelect?: (id: string, checked: boolean) => void;
		onEdit: (m: MemberView) => void;
		/** Optional CTA — when provided the empty state renders an "anlegen" button. */
		onAdd?: () => void;
		/** Clears the active search from the "Keine Treffer" state. */
		onClearSearch?: () => void;
	} = $props();

	const hasQuery = $derived(query.trim().length > 0);

	// Package D: current Buchungsjahr for column header (ADR-0001).
	const headerYear = $derived(
		years.length > 0 ? clampYearToAvailable(currentBuchungsjahr(), years) : null,
	);
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
				<MemberCardMobile {member} {years} {satzByYear} />
			</div>
		{/each}
	</div>

	<!-- Desktop (md+): full row with kebab actions + single current-year pill -->
	<div
		data-testid="member-row-list"
		class="hidden space-y-2 md:block"
		role="list"
		aria-label="Mitgliederliste"
	>
		<!-- Package D: column header row -->
		{#if headerYear !== null}
			<div
				data-testid="member-list-beitrag-header"
				class="flex items-center gap-3 px-4 pb-1 text-xs font-medium text-muted-foreground"
				aria-hidden="true"
			>
				<!-- Spacer matching avatar + name columns -->
				<div class="h-10 w-10 shrink-0"></div>
				<div class="min-w-0 flex-1"></div>
				<span class="shrink-0">Beitrag {headerYear}</span>
				<!-- Spacer matching pay-trigger + kebab -->
				<div class="w-8 shrink-0"></div>
			</div>
		{/if}

		{#each members as member (member.id)}
			<div role="listitem">
				<MemberRow
					{member}
					{years}
					{onEdit}
					{selectable}
					selected={selectedIds?.has(member.id) ?? false}
					{bulkYear}
					{satzByYear}
					{onToggleSelect}
				/>
			</div>
		{/each}
	</div>
{/if}

<script lang="ts">
	import { enhance } from '$app/forms';
	import BeitragsBadge from './BeitragsBadge.svelte';
	import {
		beitragStatusFor,
		type MemberView,
		type MemberBeitragsTotals
	} from '$lib/domain/members.js';

	let {
		members,
		years,
		totalsByYear = {}
	}: {
		members: MemberView[];
		years: number[];
		/** C5-MEM-lite — per-year aggregates for the header line. */
		totalsByYear?: Record<number, MemberBeitragsTotals>;
	} = $props();

	let compact = $state(false);
	let sortBy = $state<'name' | 'status'>('name');
	let markingKey = $state<string | null>(null);

	// C5-MEM-lite — active year for the €-summen header. The default tracks
	// the middle year in the window (the anchor / current Buchungsjahr) so the
	// header lands on "today" out of the box. Once the user clicks a tab the
	// explicit selection sticks until the prop window slides past it.
	let activeYearOverride = $state<number | null>(null);
	const defaultYear = $derived(years[Math.floor(years.length / 2)] ?? new Date().getFullYear());
	const activeYear = $derived(
		activeYearOverride !== null && years.includes(activeYearOverride)
			? activeYearOverride
			: defaultYear
	);

	function fmtEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	const headerTotals = $derived<MemberBeitragsTotals>(
		totalsByYear[activeYear] ?? { memberCount: 0, paidCents: 0, offenCents: 0 }
	);

	// Count paid per year
	function paidCount(year: number): number {
		return members.filter((m) => {
			const b = m.beitrags[year];
			return b && beitragStatusFor(b) === 'paid';
		}).length;
	}

	const sorted = $derived(
		[...members].sort((a, b) => {
			if (sortBy === 'name') {
				return (a.nachname + a.vorname).localeCompare(b.nachname + b.vorname, 'de');
			}
			// Sort by number of unpaid beitrags descending (most unpaid first)
			const aUnpaid = years.filter((y) => {
				const bm = a.beitrags[y];
				return !bm || beitragStatusFor(bm) !== 'paid';
			}).length;
			const bUnpaid = years.filter((y) => {
				const bm = b.beitrags[y];
				return !bm || beitragStatusFor(bm) !== 'paid';
			}).length;
			return bUnpaid - aUnpaid;
		})
	);
</script>

<div class="overflow-x-auto rounded-xl border border-border">
	<!-- C5-MEM-lite — per-year tab switcher for the €-summen header -->
	<div
		class="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2 text-xs"
		role="tablist"
		aria-label="Buchungsjahr für Beitrags-Summen"
	>
		<span class="text-muted-foreground">Jahr:</span>
		{#each years as y (y)}
			<button
				type="button"
				role="tab"
				aria-selected={activeYear === y}
				onclick={() => (activeYearOverride = y)}
				class="rounded px-2 py-0.5 font-medium transition-colors {activeYear === y
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-muted dark:text-muted-foreground'}"
				data-testid="matrix-year-tab"
				data-year={y}
			>
				{y}
			</button>
		{/each}
	</div>

	<!-- C5-MEM-lite — €-summen header: {N} Mitglieder · {X €} offen · {Y €} bezahlt -->
	<div
		class="border-b border-border bg-card px-4 py-3 dark:bg-card/60"
		data-testid="matrix-header-totals"
		data-year={activeYear}
	>
		<p class="text-sm font-medium text-foreground tabular-nums">
			<span data-testid="matrix-header-mitglieder">{headerTotals.memberCount} Mitglieder</span>
			<span class="text-muted-foreground">·</span>
			<span data-testid="matrix-header-offen">{fmtEur(headerTotals.offenCents)} offen</span>
			<span class="text-muted-foreground">·</span>
			<span data-testid="matrix-header-bezahlt">{fmtEur(headerTotals.paidCents)} bezahlt</span>
		</p>
	</div>

	<!-- Controls -->
	<div
		class="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2"
	>
		<div class="flex items-center gap-2 text-sm">
			<span class="text-muted-foreground">Sortieren:</span>
			<button
				type="button"
				onclick={() => (sortBy = 'name')}
				class="rounded px-2 py-0.5 text-xs font-medium transition-colors {sortBy === 'name'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-muted'}"
			>
				Name
			</button>
			<button
				type="button"
				onclick={() => (sortBy = 'status')}
				class="rounded px-2 py-0.5 text-xs font-medium transition-colors {sortBy === 'status'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-muted'}"
			>
				Status
			</button>
		</div>
		<button
			type="button"
			onclick={() => (compact = !compact)}
			class="text-xs text-muted-foreground hover:text-foreground"
			aria-pressed={compact}
		>
			{compact ? 'Normal' : 'Kompakt'}
		</button>
	</div>

	<table class="w-full min-w-[500px] text-sm">
		<thead>
			<tr class="border-b border-border bg-muted/50">
				<th
					class="sticky left-0 z-10 bg-muted/50 px-4 py-2.5 text-left font-semibold text-foreground backdrop-blur-sm"
					scope="col"
				>
					Mitglied
				</th>
				{#each years as year (year)}
					<th class="px-4 py-2.5 text-center font-semibold text-foreground" scope="col">
						<div>{year}</div>
						<div class="text-xs font-normal text-muted-foreground">
							{paidCount(year)}/{members.length} bezahlt
						</div>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#if sorted.length === 0}
				<tr>
					<td colspan={years.length + 1} class="px-4 py-8 text-center text-muted-foreground">
						Noch keine Mitglieder
					</td>
				</tr>
			{:else}
				{#each sorted as member (member.id)}
					<tr
						class="border-b border-border transition-colors last:border-0 hover:bg-muted/20 {compact
							? 'text-xs'
							: ''}"
					>
						<td class="sticky left-0 z-10 bg-card px-4 py-2.5 backdrop-blur-sm">
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href="/app/mitglieder/{member.id}" class="font-medium text-foreground hover:text-primary">{member.nachname}, {member.vorname}</a>
							{#if member.austrittsDatum}
								<span class="ml-1 text-xs text-destructive">(ausgetreten)</span>
							{/if}
						</td>
						{#each years as year (year)}
							{@const b = member.beitrags[year]}
							{@const status = b ? beitragStatusFor(b) : 'open'}
							<td class="px-4 py-2.5 text-center">
								{#if status !== 'paid'}
									<form
										method="POST"
										action="?/mark-beitrag-paid"
										use:enhance={() => {
											markingKey = `${member.id}-${year}`;
											return async ({ update }) => {
												await update();
												markingKey = null;
											};
										}}
										class="inline"
									>
										<input type="hidden" name="member_id" value={member.id} />
										<input type="hidden" name="year" value={year} />
										<button
											type="submit"
											aria-label={`Beitrag ${year} für ${member.vorname} ${member.nachname} als bezahlt markieren`}
											disabled={markingKey === `${member.id}-${year}`}
											class="disabled:opacity-50"
										>
											<BeitragsBadge {year} {status} compact={true} />
										</button>
									</form>
								{:else}
									<BeitragsBadge {year} {status} compact={true} />
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
</div>

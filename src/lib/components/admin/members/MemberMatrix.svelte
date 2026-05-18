<script lang="ts">
	import { enhance } from '$app/forms';
	import BeitragsBadge from './BeitragsBadge.svelte';
	import { beitragStatusFor, type MemberView } from '$lib/domain/members.js';

	let {
		members,
		years
	}: {
		members: MemberView[];
		years: number[];
	} = $props();

	let compact = $state(false);
	let sortBy = $state<'name' | 'status'>('name');
	let markingKey = $state<string | null>(null);

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
											title="Als bezahlt markieren"
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

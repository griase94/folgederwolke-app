<script lang="ts">
	/**
	 * Projekte card (spec §7): name · Buchungen-count · saldo. Negative saldi
	 * use the severity text token (aggregate rule §2 — individual rows stay ink,
	 * project SALDI are aggregates). Empty state collapses.
	 */
	import { formatMoney } from '$lib/components/ui/money/money.svelte';

	let {
		rows
	}: {
		rows: {
			id: string;
			name: string;
			businessId: string;
			saldoCents: number;
			buchungenCount: number;
		}[];
	} = $props();
</script>

{#if rows.length > 0}
	<section class="rounded-2xl bg-card p-4 shadow-(--shadow-card)" aria-labelledby="projekte-heading">
		<h2 id="projekte-heading" class="mb-2 text-sm font-semibold tracking-tight text-ink-900">
			Projekte
		</h2>
		<ul class="flex flex-col">
			{#each rows as row (row.id)}
				<li>
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={`/app/projekte/${row.id}`}
						class="flex h-13 items-center justify-between gap-3 rounded-[10px] px-1 hover:bg-(--surface-glass) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) md:h-11"
					>
						<span class="min-w-0 truncate text-[15px] font-medium text-ink-700 md:text-sm">
							{row.name}
						</span>
						<span class="flex shrink-0 items-baseline gap-3">
							<span class="text-xs text-ink-500">
								{row.buchungenCount === 1 ? '1 Buchung' : `${row.buchungenCount} Buchungen`}
							</span>
							<span
								data-testid={`projekt-saldo-${row.businessId}`}
								class={'text-sm font-medium tabular-nums ' +
									(row.saldoCents < 0 ? 'text-severity-critical-text' : 'text-ink-700')}
							>
								{formatMoney(row.saldoCents)}
							</span>
						</span>
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</li>
			{/each}
		</ul>
	</section>
{/if}

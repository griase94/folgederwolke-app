<script lang="ts" module>
	import type { Component } from 'svelte';
	import type { SphereYoYRow, YoyDelta } from '$lib/server/eur/index.js';
	import { Money } from '$lib/components/ui/money/index.js';
	import { formatMoney } from '$lib/components/ui/money/index.js';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import LandmarkIcon from '@lucide/svelte/icons/landmark';
	import TargetIcon from '@lucide/svelte/icons/target';
	import BriefcaseIcon from '@lucide/svelte/icons/briefcase';

	export interface SphereYoYTableProps {
		rows: SphereYoYRow[];
		year: number;
		priorYear: number;
		totalEinnahmenCents: number;
		totalAusgabenCents: number;
		totalUeberschussCents: number;
		priorTotalUeberschussCents: number;
	}

	const SPHERE_LABELS: Record<string, string> = {
		ideeller: 'Ideeller Bereich',
		vermoegen: 'Vermögensverwaltung',
		zweckbetrieb: 'Zweckbetrieb',
		wirtschaftlich: 'Wirtschaftlicher Geschäftsbetrieb'
	};

	// C1-L1 — lucide icons per UI-006 design-system pass.
	// Mapping rationale:
	//   ideeller       → Heart       (mission-driven, non-economic)
	//   vermoegen      → Landmark    (assets, treasury)
	//   zweckbetrieb   → Target      (purpose-driven economic activity)
	//   wirtschaftlich → Briefcase   (commercial)
	const SPHERE_ICONS: Record<string, Component> = {
		ideeller: HeartIcon,
		vermoegen: LandmarkIcon,
		zweckbetrieb: TargetIcon,
		wirtschaftlich: BriefcaseIcon
	};
</script>

<script lang="ts">
	let {
		rows,
		year,
		priorYear,
		totalEinnahmenCents,
		totalAusgabenCents,
		totalUeberschussCents,
		priorTotalUeberschussCents
	}: SphereYoYTableProps = $props();

	function totalDelta(): YoyDelta {
		const abs = totalUeberschussCents - priorTotalUeberschussCents;
		const pct =
			priorTotalUeberschussCents <= 0
				? null
				: Math.round((abs / priorTotalUeberschussCents) * 100);
		return { absCents: abs, pct };
	}

	function chipColor(d: YoyDelta): string {
		if (d.absCents === 0) return 'bg-muted text-muted-foreground';
		if (d.absCents > 0)
			return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400';
		return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400';
	}

	function chipLabel(d: YoyDelta): string {
		const sign = d.absCents > 0 ? '+' : d.absCents < 0 ? '−' : '±';
		const abs = formatMoney(Math.abs(d.absCents));
		if (d.pct === null) return `${sign}${abs}`;
		const pctSign = d.pct > 0 ? '+' : d.pct < 0 ? '−' : '±';
		return `${sign}${abs} (${pctSign}${Math.abs(d.pct)} %)`;
	}
</script>

<div
	data-testid="sphere-yoy-table"
	class="rounded-xl border border-border bg-card shadow-sm"
>
	<div class="rounded-t-xl border-b border-border bg-muted/30 px-5 py-4">
		<h2 class="text-base font-semibold text-foreground sm:text-lg">
			Sphären-Übersicht {year} vs. {priorYear}
		</h2>
		<p class="mt-0.5 text-xs text-muted-foreground sm:text-sm">
			Einnahmen-Überschuss-Rechnung pro steuerlicher Sphäre
		</p>
	</div>

	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-border bg-muted/40">
					<th class="px-5 py-3 text-left font-medium text-muted-foreground">Sphäre</th>
					<th class="px-3 py-3 text-right font-medium text-muted-foreground">Einnahmen</th>
					<th class="px-3 py-3 text-right font-medium text-muted-foreground">Ausgaben</th>
					<th class="px-3 py-3 text-right font-medium text-muted-foreground">Überschuss</th>
					<th class="px-5 py-3 text-right font-medium text-muted-foreground">vs. {priorYear}</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as r (r.sphere)}
					{@const Icon = SPHERE_ICONS[r.sphere]}
					<tr class="border-b border-border/50 hover:bg-muted/20" data-sphere={r.sphere}>
						<td class="px-5 py-3">
							<div class="flex items-center gap-2.5">
								<span
									aria-hidden="true"
									class="text-primary"
									data-testid={`sphere-icon-${r.sphere}`}
								>
									{#if Icon}
										<Icon class="size-4" />
									{/if}
								</span>
								<span class="font-medium text-foreground">
									{SPHERE_LABELS[r.sphere]}
								</span>
							</div>
						</td>
						<td class="px-3 py-3 text-right tabular-nums text-foreground">
							<Money valueInCents={r.einnahmenCents} />
						</td>
						<td class="px-3 py-3 text-right tabular-nums text-foreground">
							<Money valueInCents={r.ausgabenCents} />
						</td>
						<td
							class="px-3 py-3 text-right tabular-nums font-medium"
							class:text-emerald-700={r.ueberschussCents >= 0}
							class:text-rose-700={r.ueberschussCents < 0}
						>
							<Money valueInCents={r.ueberschussCents} />
						</td>
						<td class="px-5 py-3 text-right">
							<span
								data-testid={`yoy-chip-${r.sphere}`}
								class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${chipColor(r.yoyUeberschuss)}`}
							>
								{chipLabel(r.yoyUeberschuss)}
							</span>
						</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr class="border-t-2 border-border bg-muted/40">
					<td class="px-5 py-3.5 font-bold text-foreground">Gesamt</td>
					<td class="px-3 py-3.5 text-right tabular-nums font-bold text-foreground">
						<Money valueInCents={totalEinnahmenCents} />
					</td>
					<td class="px-3 py-3.5 text-right tabular-nums font-bold text-foreground">
						<Money valueInCents={totalAusgabenCents} />
					</td>
					<td
						class="px-3 py-3.5 text-right tabular-nums font-bold"
						class:text-emerald-700={totalUeberschussCents >= 0}
						class:text-rose-700={totalUeberschussCents < 0}
					>
						<Money valueInCents={totalUeberschussCents} />
					</td>
					<td class="px-5 py-3.5 text-right">
						<span
							data-testid="yoy-chip-total"
							class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${chipColor(totalDelta())}`}
						>
							{chipLabel(totalDelta())}
						</span>
					</td>
				</tr>
			</tfoot>
		</table>
	</div>
</div>

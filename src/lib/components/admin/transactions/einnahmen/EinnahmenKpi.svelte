<script lang="ts">
	/**
	 * EinnahmenKpi — Phase 5 / Task 2 (Tier C2, spec §8.1).
	 *
	 * The Einnahmen list header KPI:
	 *   - a QUIET anchor: "<Jahr|Alle> · <Summe> · <N> Buchungen"  (NO "offen"
	 *     pill — Einnahmen has no open/erstattung workflow)
	 *   - a horizontal-scroll Sphären-Split chip strip: the four steuerliche
	 *     Sphären (Ideeller / Vermögen / Zweckbetrieb / Wirtschaftlich), each with
	 *     its formatted total. ALL FOUR are ALWAYS shown — an empty sphere renders
	 *     as `0,00 €` rather than being hidden, so the gemeinnützigkeit reading is
	 *     always complete.
	 *
	 * Sphere colors reuse the §13 palette token map exported by SphereBadge.
	 */
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { SPHERE_BADGE_CLASSES } from '../fields/SphereBadge.svelte';
	import { SPHERE_LABELS, SPHERES, type Sphere } from '$lib/domain/sphere.js';
	import { ALL_YEARS, type YearScope } from '$lib/domain/year.js';

	interface Props {
		/** Sum of all non-superseded income cents in scope. */
		totalCents: number;
		/** Count of all non-superseded income in scope. */
		count: number;
		/** Per-sphere cents totals — all four keys present (0 when empty). */
		bySphere: Record<Sphere, number>;
		/** Year scope for the anchor — concrete year or the ALL_YEARS sentinel. */
		year: YearScope;
	}

	let { totalCents, count, bySphere, year }: Props = $props();

	const yearLabel = $derived(year === ALL_YEARS ? 'Alle' : String(year));
	const totalLabel = $derived(formatMoney(totalCents));
</script>

<div data-testid="kpi-strip" class="flex flex-col gap-3">
	<!-- ── Quiet anchor: Jahr · Summe · N (no offen-pill) ─────────────────── -->
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-foreground">Einnahmen</h1>
		<p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
			<span>{yearLabel}</span>
			<span aria-hidden="true">·</span>
			<span class="font-medium tabular-nums text-foreground">{totalLabel}</span>
			<span aria-hidden="true">·</span>
			<span class="tabular-nums">{count} Buchungen</span>
		</p>
	</div>

	<!-- ── Sphären-Split chip strip (mobile horizontal-scroll, §8.1) ──────────
	     All four chips ALWAYS rendered — empty spheres show 0,00 €. -->
	<div
		data-slot="sphere-split"
		aria-label="Einnahmen nach Sphäre"
		class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
	>
		{#each SPHERES as sphere (sphere)}
			<div
				data-sphere-chip
				data-sphere={sphere}
				class={[
					'flex shrink-0 flex-col gap-0.5 rounded-lg px-3 py-2',
					SPHERE_BADGE_CLASSES[sphere],
				].join(' ')}
			>
				<span class="text-xs font-medium">{SPHERE_LABELS[sphere]}</span>
				<span class="text-sm font-semibold tabular-nums">{formatMoney(bySphere[sphere])}</span>
			</div>
		{/each}
	</div>
</div>

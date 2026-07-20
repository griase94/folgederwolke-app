<script lang="ts">
	/**
	 * EinnahmenKpi — Phase 5 / Task 2 (Tier C2, spec §8.1), plate transaktionen-v4
	 * §4. A quiet anchor ("<Jahr|Alle> · <Summe> · <N>") over the Sphären-Split as
	 * Kit tiles: the four steuerliche Sphären (Ideeller / Vermögen / Zweckbetrieb /
	 * Wirtschaftlich), each with its total. ALL FOUR are ALWAYS shown — an empty
	 * sphere renders 0,00 € rather than being hidden, so the gemeinnützigkeit
	 * reading is always complete. Sphere hue rides the tile swatch (never the
	 * number — ANDY-LENS §4).
	 */
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { SPHERE_VAR } from '$lib/components/charts/_shared/tokens.js';
	import KpiStrip from '../KpiStrip.svelte';
	import KpiTile from '../KpiTile.svelte';
	import { SPHERES, type Sphere } from '$lib/domain/sphere.js';
	import { yearScopeLabel, type YearScope } from '$lib/domain/year.js';
	import { buchungenLabel as fmtBuchungen } from '$lib/domain/transaction-kpi.js';

	// Short sphere labels for the narrow KPI tiles (dashboard-v10 forms): the full
	// "Wirtschaftlicher Geschäftsbetrieb" would clip in a quarter-width tile. The
	// full names still live in SPHERE_LABELS for prose surfaces.
	const SPHERE_TILE_LABEL: Record<Sphere, string> = {
		ideeller: 'Ideeller Bereich',
		vermoegen: 'Vermögen',
		zweckbetrieb: 'Zweckbetrieb',
		wirtschaftlich: 'Wirtsch. Geschäftsbetrieb'
	};

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

	const yearLabel = $derived(yearScopeLabel(year));
	const totalLabel = $derived(formatMoney(totalCents));
	const buchungenLabel = $derived(fmtBuchungen(count));
</script>

<div data-testid="kpi-strip" class="flex flex-col gap-3">
	<!-- ── Quiet anchor: Jahr · Summe · N (no offen-pill) ─────────────────── -->
	<p class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
		<span>{yearLabel}</span>
		<span aria-hidden="true">·</span>
		<span class="font-medium tabular-nums text-foreground">{totalLabel}</span>
		<span aria-hidden="true">·</span>
		<span class="tabular-nums">{buchungenLabel}</span>
	</p>

	<!-- ── Sphären-Split as Kit tiles (§8.1) — all four ALWAYS shown ────────── -->
	<KpiStrip data-slot="sphere-split" aria-label="Einnahmen nach Sphäre">
		{#each SPHERES as sphere (sphere)}
			<KpiTile
				label={SPHERE_TILE_LABEL[sphere]}
				value={formatMoney(bySphere[sphere])}
				accent={SPHERE_VAR[sphere]}
				data-sphere-chip=""
				data-sphere={sphere}
			/>
		{/each}
	</KpiStrip>
</div>

<script lang="ts">
	/**
	 * EinnahmenKpi — the Einnahmen list KPI strip (spec §8 M3, §8.1).
	 *
	 * A quiet anchor ("<Jahr|Alle> · <Summe> · <N>") over the Sphären-Split as
	 * StatCards: the four steuerliche Sphären (Ideeller / Vermögen / Zweckbetrieb
	 * / Wirtschaftlich), each with its total. ALL FOUR are ALWAYS shown — an empty
	 * sphere renders a dimmed 0,00 € rather than being hidden, so the
	 * Gemeinnützigkeit reading is always complete. Sphere hue rides the dot, never
	 * the number (ANDY-LENS §4).
	 */
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { SPHERE_VAR } from '$lib/components/charts/_shared/tokens.js';
	import { StatCard, StatCardStrip } from '$lib/components/ui/stat-card/index.js';
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

	// Each sphere card drills into the matching filtered list — the "→ gefilterte
	// Liste" jump of spec §8. The year scope rides along so the drill-down shows
	// exactly the rows the tile counted.
	const sphereHref = (sphere: Sphere) =>
		`/app/einnahmen?year=${encodeURIComponent(String(year))}&sphaere=${sphere}`;

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

	<!-- ── Sphären-Split as StatCards (§8.1) — all four ALWAYS shown ───────── -->
	<StatCardStrip orientation="rail" label="Einnahmen nach Sphäre" data-sphere-split="">
		{#each SPHERES as sphere (sphere)}
			<StatCard
				label={SPHERE_TILE_LABEL[sphere]}
				format="money"
				value={formatMoney(bySphere[sphere])}
				accent={SPHERE_VAR[sphere]}
				empty={bySphere[sphere] === 0}
				href={sphereHref(sphere)}
				data-sphere-chip=""
				data-sphere={sphere}
			/>
		{/each}
	</StatCardStrip>
</div>

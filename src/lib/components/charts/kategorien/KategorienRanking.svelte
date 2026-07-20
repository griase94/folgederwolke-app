<script lang="ts" module>
	export interface KategorieItem {
		name: string;
		/** Amount, integer cents. */
		cents: number;
	}
	export type RankingHue = "ausgabe" | "einnahme" | "ink";
	export interface KategorienRankingProps {
		items: KategorieItem[];
		/** Single hue for the whole set (dataviz §2 — a ranking is one hue). */
		hue?: RankingHue;
		/** How many named rows before the tail folds into „Sonstige". */
		topN?: number;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * Top-Posten Ranking (dataviz §6 kategorien-v4) — ranked horizontal bars, one
	 * hue for the whole set (length encodes magnitude, not colour), betrag + share
	 * direct-labelled. The #1 „Größter Posten" is highlighted; the tail folds into
	 * a muted „Sonstige" row drawn außer Konkurrenz. Fully static — every value is
	 * on the page.
	 */
	import { eurWhole, pctWhole } from "../_shared/format.js";
	import { TOKEN } from "../_shared/tokens.js";
	import { barRight, niceAxis, r2 } from "../_shared/geometry.js";

	let { items, hue = "ausgabe", topN = 8, class: className }: KategorienRankingProps = $props();

	const HUE: Record<RankingHue, { bar: string; strong: string; kick: string }> = {
		ausgabe: { bar: TOKEN.ausgabe, strong: "var(--ausgabe-text)", kick: "var(--ausgabe-text)" },
		einnahme: { bar: TOKEN.einnahme, strong: TOKEN.einnahmeStrong, kick: TOKEN.einnahmeStrong },
		ink: { bar: TOKEN.ink700, strong: TOKEN.ink900, kick: TOKEN.ink700 },
	};

	const sorted = $derived([...items].sort((a, b) => b.cents - a.cents));
	const total = $derived(sorted.reduce((a, r) => a + r.cents, 0));

	type Row = { name: string; cents: number; rank: number | null; agg: boolean; count?: number };
	const rows = $derived.by<Row[]>(() => {
		const named: Row[] = sorted
			.slice(0, topN)
			.map((r, i) => ({ name: r.name, cents: r.cents, rank: i + 1, agg: false }));
		const tail = sorted.slice(topN);
		if (tail.length === 0) return named;
		const sonstige: Row = {
			name: "Sonstige",
			cents: tail.reduce((a, r) => a + r.cents, 0),
			rank: null,
			agg: true,
			count: tail.length,
		};
		return [...named, sonstige];
	});

	function share(cents: number): number {
		return total > 0 ? Math.round((cents / total) * 100) : 0;
	}

	// geometry
	const vbW = 1160;
	const x0 = 248;
	const mr = 206;
	const mt = 14;
	const rowH = 46;
	const thick = 22;
	const rankX = 26;
	const dividerGap = 22;
	const plotW = vbW - x0 - mr;

	const axis = $derived(niceAxis(Math.max(0, ...rows.map((r) => r.cents))));
	const xFor = $derived((v: number) => x0 + (v / (axis.max || 1)) * plotW);

	const dividerBefore = $derived(rows.findIndex((r) => r.agg));
	const layout = $derived.by(() => {
		const namedCount = dividerBefore === -1 ? rows.length : dividerBefore;
		const gap = dividerBefore === -1 ? 0 : dividerGap;
		const rowsH = rows.length * rowH + gap;
		const axisY = mt + rowsH + 10;
		return { vbH: axisY + 22, axisY, namedCount, gap };
	});

	function rowY(i: number): number {
		const extra = dividerBefore !== -1 && i >= dividerBefore ? dividerGap : 0;
		return mt + i * rowH + extra;
	}
</script>

<div data-slot="kategorien-ranking" data-testid="kategorien-ranking" class={className}>
	<svg
		viewBox={`0 0 ${vbW} ${layout.vbH}`}
		style:aspect-ratio={`${vbW} / ${layout.vbH}`}
		class="block h-auto w-full overflow-visible"
		role="img"
		aria-label={`Rangliste der ${layout.namedCount} größten Posten, je Balken mit Betrag und Anteil; Rest gebündelt in Sonstige`}
	>
		{#each axis.ticks as t (t)}
			<line x1={r2(xFor(t))} y1={mt - 2} x2={r2(xFor(t))} y2={layout.axisY - 2} style:stroke={t === 0 ? TOKEN.ink300 : TOKEN.hairline} stroke-width="1" />
			<text x={r2(xFor(t))} y={layout.axisY + 12} text-anchor="middle" font-size="10.5" font-weight="600" class="tabular-nums" style:fill={TOKEN.ink500}>{eurWhole(t)}</text>
		{/each}

		{#each rows as row, i (row.name + i)}
			{@const yTop = rowY(i)}
			{@const cy = yTop + rowH / 2}
			{@const isTop = row.rank === 1}
			{@const len = Math.max(xFor(row.cents) - x0, 0)}
			{#if isTop}
				<rect x={rankX - 10} y={r2(yTop + 3)} width={vbW - (rankX - 10) - 6} height={rowH - 6} rx="9" style:fill={TOKEN.ausgabeTint} opacity="0.55" />
			{/if}
			<text x={rankX} y={r2(cy + 4)} text-anchor="middle" font-size={isTop ? "12.5" : "12"} font-weight={isTop ? "800" : "750"} class="tabular-nums" style:fill={isTop ? HUE[hue].strong : TOKEN.ink300}>{row.agg ? "∑" : row.rank}</text>
			<text x={r2(x0 - 14)} y={r2(row.agg || isTop ? cy - 2 : cy + 4)} text-anchor="end" font-size="12.5" font-weight={isTop ? "750" : row.agg ? "600" : "650"} style:fill={row.agg ? TOKEN.ink500 : TOKEN.ink900}>{row.name}</text>
			{#if isTop}
				<text x={r2(x0 - 14)} y={r2(cy + 11)} text-anchor="end" font-size="9.5" font-weight="750" letter-spacing="0.05em" style:fill={HUE[hue].kick}>GRÖSSTER POSTEN</text>
			{:else if row.agg}
				<text x={r2(x0 - 14)} y={r2(cy + 11)} text-anchor="end" font-size="9.5" font-weight="600" style:fill={TOKEN.ink300}>{row.count} Kleinposten gebündelt</text>
			{/if}
			<path d={barRight(x0, cy - thick / 2, len, thick)} style:fill={row.agg ? TOKEN.paid : isTop ? HUE[hue].strong : HUE[hue].bar} />
			<text x={r2(x0 + len + 11)} y={r2(cy + 4.4)} text-anchor="start" font-size={isTop ? "13" : "12.5"} font-weight={isTop ? "800" : "750"} class="tabular-nums" style:fill={row.agg ? TOKEN.ink500 : TOKEN.ink900}>
				{eurWhole(row.cents)}<tspan dx="7" font-size="11" font-weight="700" style:fill={TOKEN.ink300}>· {pctWhole(share(row.cents))}</tspan>
			</text>
		{/each}
	</svg>

	<table class="sr-only" data-testid="kategorien-table">
		<caption>Top-Posten Rangliste</caption>
		<thead><tr><th>Rang</th><th>Kategorie</th><th>Betrag</th><th>Anteil</th></tr></thead>
		<tbody>
			{#each rows as row, i (row.name + i)}
				<tr><td>{row.agg ? "Sonstige" : row.rank}</td><td>{row.name}</td><td>{eurWhole(row.cents)}</td><td>{pctWhole(share(row.cents))}</td></tr>
			{/each}
		</tbody>
	</table>
</div>

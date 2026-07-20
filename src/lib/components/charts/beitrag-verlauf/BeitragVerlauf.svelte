<script lang="ts" module>
	export interface BeitragVerlaufProps {
		/** Cumulative Beitrags-Eingang per month-end, integer cents (12). */
		cumulativeCents: number[];
		/** Cumulative members who have paid, per month-end (12). */
		membersPaid: number[];
		/** Jahresziel (target), integer cents. */
		targetCents: number;
		/** Liable member population. */
		totalMembers: number;
		year: number;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * Beitrags-Eingang übers Jahr (dataviz §6 beitrag-verlauf-v5) — a cumulative
	 * green area climbing to a dashed Jahresziel line; the amber gap at the right
	 * edge is the offene Rest. A hero readout gives Stand · % · offen · Mitglieder.
	 * Desktop hover snaps a crosshair and swaps a fixed readout card (it never
	 * chases the pointer); mobile taps switch the same card. Table twin backs it.
	 */
	import { MONTHS, MONTHS_FULL, eurCents, pctWhole } from "../_shared/format.js";
	import { TOKEN } from "../_shared/tokens.js";
	import { linePath, areaFromLine, r2, type Point } from "../_shared/geometry.js";
	import { watchFineHover, nearestIndex, type ChartGeo } from "../_shared/interaction.js";
	import { onMount } from "svelte";

	let {
		cumulativeCents,
		membersPaid,
		targetCents,
		totalMembers,
		year,
		class: className,
	}: BeitragVerlaufProps = $props();

	const N = $derived(cumulativeCents.length);
	const collected = $derived(cumulativeCents[N - 1] ?? 0);
	const openCents = $derived(Math.max(0, targetCents - collected));
	const pctReached = $derived(targetCents > 0 ? Math.round((collected / targetCents) * 100) : 0);
	const membersNow = $derived(membersPaid[N - 1] ?? 0);

	// geometry
	const vbW = 1200;
	const vbH = 340;
	const ml = 52;
	const mr = 70;
	const mt = 26;
	const mb = 30;

	const g = $derived.by(() => {
		const pW = vbW - ml - mr;
		const pH = vbH - mt - mb;
		const yMax = Math.max(targetCents, ...cumulativeCents) * 1.04 || 1;
		const X = (i: number) => ml + (i / (N - 1 || 1)) * pW;
		const Y = (v: number) => mt + (1 - v / yMax) * pH;
		const pts: Point[] = cumulativeCents.map((v, i) => [X(i), Y(v)]);
		return { pW, pH, yMax, X, Y, pts, base: mt + pH, yTarget: Y(targetCents), yColl: Y(collected), xEnd: X(N - 1) };
	});
	const line = $derived(linePath(g.pts));
	const area = $derived(areaFromLine(line, g.pts, g.base));

	let fineHover = $state(false);
	onMount(() => watchFineHover((v) => (fineHover = v)));
	let activeIndex = $state<number | null>(null);
	const idx = $derived(activeIndex ?? N - 1);

	let svgEl = $state<SVGSVGElement | null>(null);
	let geo = $state<ChartGeo | null>(null);
	function measure() {
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		if (rect.width === 0) return;
		geo = { rect, sx: rect.width / vbW, sy: rect.height / vbH };
	}
	$effect(() => {
		if (typeof window === "undefined") return;
		measure();
		const on = () => measure();
		window.addEventListener("resize", on);
		return () => window.removeEventListener("resize", on);
	});
	function onMove(e: PointerEvent) {
		if (!fineHover) return;
		if (!geo) measure();
		if (!geo) return;
		activeIndex = nearestIndex(e.clientX, geo, vbW, ml, g.pW, N);
	}
	function onDown(e: PointerEvent) {
		if (fineHover) return;
		if (!geo) measure();
		if (!geo) return;
		activeIndex = nearestIndex(e.clientX, geo, vbW, ml, g.pW, N);
	}
	function onLeave() {
		if (fineHover) activeIndex = null;
	}

	const gid = $derived(`beitrag-fill-${year}`);
	const ZERO_PT: Point = [0, 0];
	const idxCum = $derived(cumulativeCents[idx] ?? 0);
	const idxMembers = $derived(membersPaid[idx] ?? 0);
	const actPt = $derived(activeIndex !== null ? (g.pts[activeIndex] ?? ZERO_PT) : null);
	const endPt = $derived(g.pts[N - 1] ?? ZERO_PT);
	const monthOpen = $derived(Math.max(0, targetCents - idxCum));
	const monthPct = $derived(targetCents > 0 ? Math.round((idxCum / targetCents) * 100) : 0);
</script>

<div data-slot="beitrag-verlauf" data-testid="beitrag-verlauf" class={className}>
	<!-- hero readout -->
	<div class="mb-4 flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="text-[11px] font-bold uppercase tracking-[0.07em] text-ink-300">Stand heute · {pctReached} % vom Ziel</p>
			<p class="mt-1 text-[32px] font-extrabold leading-none tabular-nums text-ink-900">{eurCents(collected)}</p>
			<p class="mt-1 text-[12px] font-semibold text-ink-500">von <b class="text-ink-700">{eurCents(targetCents)}</b> Jahresziel</p>
		</div>
		<div class="min-w-[220px] flex-1">
			<div class="h-[9px] overflow-hidden rounded-md" style:background-color={TOKEN.track}>
				<div class="h-full rounded-md" style:width={`${pctReached}%`} style:background={`linear-gradient(90deg, ${TOKEN.einnahme}, ${TOKEN.einnahmeStrong})`}></div>
			</div>
			<div class="mt-1.5 flex items-center justify-between text-[11.5px] font-bold tabular-nums">
				<span style:color={TOKEN.einnahmeStrong}>{pctReached} % erreicht</span>
				<span style:color={TOKEN.warnText}>{eurCents(openCents)} offen</span>
			</div>
			<p class="mt-1 text-[11.5px] font-semibold tabular-nums text-ink-500"><b style:color={TOKEN.einnahmeStrong}>{membersNow} / {totalMembers}</b> Mitglieder haben gezahlt · {totalMembers - membersNow} offen</p>
		</div>
	</div>

	<div class="relative">
		<svg
			bind:this={svgEl}
			viewBox={`0 0 ${vbW} ${vbH}`}
			style:aspect-ratio={`${vbW} / ${vbH}`}
			class="block h-auto w-full overflow-visible"
			role="img"
			aria-label={`Kumulierte Beiträge ${year} bis zum Jahresziel ${eurCents(targetCents)}; Stand ${eurCents(collected)}, ${pctReached} Prozent, ${membersNow} von ${totalMembers} Mitgliedern, ${eurCents(openCents)} offen`}
			onpointermove={onMove}
			onpointerdown={onDown}
			onpointerleave={onLeave}
		>
			<defs>
				<linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" style:stop-color={TOKEN.einnahme} stop-opacity="0.22" />
					<stop offset="1" style:stop-color={TOKEN.einnahme} stop-opacity="0.02" />
				</linearGradient>
			</defs>

			<path d={area} fill={`url(#${gid})`} />
			<path d={line} fill="none" style:stroke={TOKEN.einnahme} stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />

			<!-- dashed target line (the only dashed rule) -->
			<line x1={ml} y1={r2(g.yTarget)} x2={ml + g.pW} y2={r2(g.yTarget)} style:stroke={TOKEN.ink500} stroke-width="1.4" stroke-dasharray="5 4" />
			<text x={r2(g.xEnd - 6)} y={r2(g.yTarget - 7)} text-anchor="end" font-size="11" font-weight="700" class="tabular-nums" style:fill={TOKEN.ink500}>Jahresziel · {eurCents(targetCents)}</text>

			<!-- amber gap bracket = offener Rest -->
			{#if openCents > 0}
				{@const yMid = (g.yColl + g.yTarget) / 2}
				<line x1={r2(g.xEnd)} y1={r2(g.yColl)} x2={r2(g.xEnd)} y2={r2(g.yTarget)} style:stroke={TOKEN.warn} stroke-width="1.6" />
				<line x1={r2(g.xEnd - 3)} y1={r2(g.yColl)} x2={r2(g.xEnd + 3)} y2={r2(g.yColl)} style:stroke={TOKEN.warn} stroke-width="1.6" />
				<line x1={r2(g.xEnd - 3)} y1={r2(g.yTarget)} x2={r2(g.xEnd + 3)} y2={r2(g.yTarget)} style:stroke={TOKEN.warn} stroke-width="1.6" />
				<text x={r2(g.xEnd + 8)} y={r2(yMid - 1)} font-size="11" font-weight="700" class="tabular-nums" style:fill={TOKEN.warnText}>{eurCents(openCents)}</text>
				<text x={r2(g.xEnd + 8)} y={r2(yMid + 13)} font-size="10" font-weight="600" style:fill={TOKEN.warnText}>offen</text>
			{/if}

			{#each MONTHS as m, i (i)}
				<text x={r2(g.X(i))} y={vbH - 9} text-anchor="middle" font-size="10.5" font-weight={i === idx ? "750" : "400"} style:fill={i === idx ? TOKEN.einnahmeStrong : TOKEN.ink500}>{m}</text>
			{/each}

			{#if actPt && fineHover && activeIndex !== null}
				<line x1={r2(g.X(activeIndex))} y1={mt} x2={r2(g.X(activeIndex))} y2={r2(g.base)} style:stroke={TOKEN.crosshair} stroke-width="1" />
				<circle cx={r2(actPt[0])} cy={r2(actPt[1])} r="5" style:fill={TOKEN.einnahme} style:stroke={TOKEN.card} stroke-width="2.5" />
			{/if}

			<!-- endpoint "jetzt" -->
			<circle cx={r2(endPt[0])} cy={r2(endPt[1])} r="5" style:fill={TOKEN.einnahme} style:stroke={TOKEN.card} stroke-width="2.5" />
		</svg>

		<!-- fixed readout card (never chases the pointer) -->
		<div
			data-testid="beitrag-readout"
			class="pointer-events-none absolute left-2 top-2 z-10 w-[220px] rounded-xl border bg-card p-3 text-right shadow-(--shadow-card)"
			aria-hidden="true"
		>
			<div class="mb-2 flex items-center justify-between border-b border-(--hairline) pb-2">
				<span class="text-[11px] font-extrabold uppercase" style:color={TOKEN.einnahmeStrong}>{MONTHS_FULL[idx]} {year}</span>
				{#if idx === N - 1}<span class="rounded-full px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase" style:color={TOKEN.einnahmeStrong} style:background-color={TOKEN.einnahmeTint}>aktuell</span>{/if}
			</div>
			<div class="flex items-baseline justify-between"><span class="text-[11px] text-ink-500">kumuliert</span><span class="text-[13.5px] font-extrabold tabular-nums text-ink-900">{eurCents(idxCum)}</span></div>
			<div class="mt-1 flex items-baseline justify-between"><span class="text-[11px] text-ink-500">offen</span><span class="text-[12px] font-bold tabular-nums" style:color={TOKEN.warnText}>{eurCents(monthOpen)}</span></div>
			<div class="mt-1 flex items-baseline justify-between"><span class="text-[11px] text-ink-500">% vom Ziel</span><span class="text-[12px] font-bold tabular-nums text-ink-700">{pctWhole(monthPct)}</span></div>
			<div class="mt-1.5 flex items-baseline justify-between border-t border-(--hairline) pt-1.5"><span class="text-[11px] font-bold text-ink-700">Mitglieder</span><span class="text-[12px] font-bold tabular-nums" style:color={TOKEN.einnahmeStrong}>{idxMembers} / {totalMembers}</span></div>
		</div>
	</div>

	<table class="sr-only" data-testid="beitrag-table">
		<caption>Beitrags-Eingang kumuliert {year}</caption>
		<thead><tr><th>Monat</th><th>Kumuliert</th><th>Offen</th><th>Mitglieder</th></tr></thead>
		<tbody>
			{#each cumulativeCents as v, i (i)}
				<tr><td>{MONTHS[i]} {year}</td><td>{eurCents(v)}</td><td>{eurCents(Math.max(0, targetCents - v))}</td><td>{membersPaid[i]} / {totalMembers}</td></tr>
			{/each}
		</tbody>
	</table>
</div>

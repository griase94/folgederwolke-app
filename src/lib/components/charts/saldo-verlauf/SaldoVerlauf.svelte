<script lang="ts" module>
	export interface SaldoVerlaufProps {
		/** 12 month-end running balances, integer cents (ADR-0003). */
		monthlyCents: number[];
		/** Opening balance (year start), integer cents — the Δ reference. */
		openingCents: number;
		/** Buchungsjahr. */
		year: number;
		/** Optional eyebrow override (default "Saldo · Buchungsjahr {year}"). */
		eyebrow?: string;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * Saldo-Verlauf (dataviz §6 saldo-verlauf-v7) — the trend form: a hero
	 * figure leads, an achs-less 12-point sparkline gives context. Desktop hover
	 * snaps a crosshair to the nearest month and swaps the hero + a fixed-size
	 * readout card (flicker-free: geometry cached, card never chases the cursor).
	 * Mobile is 100% hover-free — the current stand, Tief- and Höchststand are all
	 * printed directly, and a sr-only table twin backs the whole series.
	 */
	import {
		MONTHS,
		eurCents,
		eurCentsSigned,
		pctOneSigned,
		heroParts,
	} from "../_shared/format.js";
	import { TOKEN } from "../_shared/tokens.js";
	import { linePath, areaFromLine, r2, type Point } from "../_shared/geometry.js";
	import {
		watchFineHover,
		nearestIndex,
		type ChartGeo,
	} from "../_shared/interaction.js";
	import { onMount } from "svelte";

	let {
		monthlyCents,
		openingCents,
		year,
		eyebrow,
		class: className,
	}: SaldoVerlaufProps = $props();

	const N = $derived(monthlyCents.length);
	const current = $derived(N - 1);

	// viewBox geometry (plate saldo-verlauf-v7 desktop frame).
	const vbW = 600;
	const vbH = 172;
	const ml = 16;
	const mr = 16;
	const mt = 26;
	const mb = 18;
	const padLo = 0.2;
	const padHi = 0.34;

	const geom = $derived.by(() => {
		const s = monthlyCents;
		const n = s.length;
		const plotW = vbW - ml - mr;
		const plotH = vbH - mt - mb;
		const baseY = mt + plotH;
		let dLo = Math.min(...s);
		let dHi = Math.max(...s);
		const hasDeficit = dLo < 0;
		if (hasDeficit) {
			dLo = Math.min(dLo, 0);
			dHi = Math.max(dHi, 0);
		}
		const span = dHi - dLo || 1;
		const lo = dLo - span * padLo;
		const hi = dHi + span * padHi;
		const band = plotW / (n - 1 || 1);
		const xFor = (i: number) => ml + i * band;
		const yFor = (v: number) => baseY - ((v - lo) / (hi - lo)) * plotH;
		const pts: Point[] = s.map((v, i) => [xFor(i), yFor(v)]);
		const minIdx = s.indexOf(Math.min(...s));
		const maxIdx = s.indexOf(Math.max(...s));
		const zeroY = yFor(0);
		return { plotW, plotH, baseY, band, pts, minIdx, maxIdx, hasDeficit, zeroY };
	});

	const line = $derived(linePath(geom.pts));
	const area = $derived(areaFromLine(line, geom.pts, geom.baseY));

	// Active month (null = resting on current). Hover only on fine pointers.
	let fineHover = $state(false);
	onMount(() => watchFineHover((v) => (fineHover = v)));
	let activeIndex = $state<number | null>(null);
	const shownIdx = $derived(activeIndex ?? current);

	const shownCents = $derived(monthlyCents[shownIdx] ?? 0);
	const deltaCents = $derived(shownCents - openingCents);
	const deltaPct = $derived(openingCents !== 0 ? (deltaCents / openingCents) * 100 : 0);
	const up = $derived(deltaCents >= 0);
	const deficit = $derived(shownCents < 0);
	const hero = $derived(heroParts(shownCents));

	// Extremes for the printed foot-stats (hover-free channel).
	const lowCents = $derived(monthlyCents[geom.minIdx] ?? 0);
	const highCents = $derived(monthlyCents[geom.maxIdx] ?? 0);

	const hueLine = $derived(deficit ? TOKEN.deficit : TOKEN.einnahme);

	// Precomputed marker points (fallback keeps types non-optional).
	const ZERO_PT: Point = [0, 0];
	const minPt = $derived(geom.pts[geom.minIdx] ?? ZERO_PT);
	const maxPt = $derived(geom.pts[geom.maxIdx] ?? ZERO_PT);
	const curPt = $derived(geom.pts[current] ?? ZERO_PT);
	const actPt = $derived(activeIndex !== null ? (geom.pts[activeIndex] ?? ZERO_PT) : null);

	// Cached geometry + tooltip placement -----------------------------------
	let svgEl = $state<SVGSVGElement | null>(null);
	let hostEl = $state<HTMLDivElement | null>(null);
	let geo = $state<ChartGeo | null>(null);
	let tipStyle = $state("opacity:0");

	function measure() {
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		if (rect.width === 0) return;
		geo = { rect, sx: rect.width / vbW, sy: rect.height / vbH };
	}

	function placeTip() {
		if (!geo || !hostEl || activeIndex === null) {
			tipStyle = "opacity:0";
			return;
		}
		const p = geom.pts[activeIndex] ?? ZERO_PT;
		const hostRect = hostEl.getBoundingClientRect();
		const offX = geo.rect.left - hostRect.left;
		const offY = geo.rect.top - hostRect.top;
		const px = offX + p[0] * geo.sx;
		const py = offY + p[1] * geo.sy;
		const tipW = 232;
		const half = tipW / 2;
		const hw = hostRect.width;
		let cx = px;
		if (cx - half < 4) cx = half + 4;
		else if (cx + half > hw - 4) cx = hw - half - 4;
		let ty = py - 96;
		if (ty < 2) ty = 2;
		tipStyle = `opacity:1;transform:translate3d(${r2(cx - half)}px,${r2(ty)}px,0)`;
	}

	$effect(() => {
		// Re-place whenever the active month changes.
		void activeIndex;
		placeTip();
	});

	function onMove(e: PointerEvent) {
		if (!fineHover) return;
		if (!geo) measure();
		if (!geo) return;
		activeIndex = nearestIndex(e.clientX, geo, vbW, ml, geom.plotW, N);
	}
	function onLeave() {
		activeIndex = null;
	}
	function onKey(e: KeyboardEvent) {
		if (!fineHover) return;
		if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
			e.preventDefault();
			const base = activeIndex ?? current;
			activeIndex = Math.max(0, Math.min(N - 1, base + (e.key === "ArrowRight" ? 1 : -1)));
		} else if (e.key === "Escape") {
			activeIndex = null;
		}
	}

	$effect(() => {
		if (typeof window === "undefined") return;
		measure();
		const on = () => {
			measure();
			placeTip();
		};
		window.addEventListener("resize", on);
		return () => window.removeEventListener("resize", on);
	});

	// Tooltip fields for the active month.
	const tipMonth = $derived(`${MONTHS[shownIdx] ?? ""} ${year}`);
	const tipYtd = $derived(shownCents - openingCents);
	const tipMom = $derived(shownCents - (shownIdx === 0 ? openingCents : (monthlyCents[shownIdx - 1] ?? 0)));
</script>

<section
	data-slot="saldo-verlauf"
	data-testid="saldo-verlauf"
	class={["flex flex-col gap-8 md:flex-row md:items-stretch", className]}
	class:is-deficit={deficit}
>
	<!-- Hero column: desktop = the left column; on mobile it's `contents` so the
	     hero block (order-1) and the extremes (order-3) join the outer flex around
	     the sparkline (order-2) → hero → sparkline → extremes (dataviz §4 order). -->
	<div class="contents md:flex md:w-[300px] md:flex-none md:flex-col">
		<div class="order-1 flex min-w-0 flex-col md:order-none">
			<p class="text-[11px] font-bold uppercase tracking-[0.09em] text-ink-500">
				{eyebrow ?? `Saldo · Buchungsjahr ${year}`}
			</p>
		<p class="mt-3 tabular-nums">
			<span
				data-testid="saldo-hero"
				class="text-[44px] font-extrabold leading-none tracking-[-0.035em] md:text-[52px]"
				style:color={deficit ? TOKEN.deficitStrong : TOKEN.ink900}
				>{hero.main}<span
					class="text-2xl font-bold md:text-[28px]"
					style:color={deficit ? TOKEN.deficit : TOKEN.ink700}>{hero.rest}</span
				></span
			>
		</p>
		<p class="mt-3 text-[13px] font-bold text-ink-500" data-testid="saldo-state">
			<span
				class="text-[10px] font-extrabold uppercase tracking-[0.11em]"
				style:color={deficit ? TOKEN.deficitStrong : TOKEN.einnahmeStrong}
				>{activeIndex === null ? "Aktuell" : "Monat"}</span
			>
			<span class="ml-1.5 text-ink-700">{MONTHS[shownIdx] ?? ""} {year}</span>
		</p>

		<!-- Δ chip: signed € on line 1, signed % since year-start on line 2 -->
		<div
			data-testid="saldo-delta"
			class="mt-4 inline-flex w-fit flex-col items-start gap-1 rounded-[13px] px-[15px] py-3"
			style:background-color={deficit ? TOKEN.deficitTint : TOKEN.einnahmeTint}
		>
			<span
				class="inline-flex items-center gap-2 text-lg font-extrabold leading-none tabular-nums"
				style:color={deficit ? TOKEN.deficitStrong : TOKEN.einnahmeStrong}
			>
				<span
					class="inline-flex size-[22px] items-center justify-center rounded-full text-white"
					style:background-color={deficit ? TOKEN.deficit : TOKEN.einnahme}
				>
					<svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						{#if up}
							<path d="m5 12 7-7 7 7" /><path d="M12 19V5" />
						{:else}
							<path d="m5 12 7 7 7-7" /><path d="M12 5v14" />
						{/if}
					</svg>
				</span>
				{eurCentsSigned(deltaCents)}
			</span>
			<span class="pl-0.5 text-[12.5px] font-semibold tabular-nums text-ink-500">
				{#if openingCents !== 0}<span
						class="font-bold"
						style:color={deficit ? TOKEN.deficitStrong : TOKEN.einnahmeStrong}
						>{pctOneSigned(deltaPct)}</span
					> {/if}seit Jahresbeginn
			</span>
		</div>

		</div>

		<!-- printed extremes — after the sparkline on mobile (dataviz §4 order) -->
		<dl class="order-3 mt-5 flex gap-7 md:order-none md:mt-auto md:pt-6" data-testid="saldo-extremes">
			<div class="flex flex-col gap-1">
				<dt class="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-300">
					<span
						class="size-[7px] rounded-full"
						style:background-color={TOKEN.card}
						style:box-shadow={`inset 0 0 0 2px ${deficit ? TOKEN.deficit : TOKEN.einnahme}`}
					></span>
					Tiefstand
				</dt>
				<dd class="text-[13.5px] font-bold tabular-nums text-ink-700">{eurCents(lowCents)}</dd>
				<dd class="text-[11px] font-semibold text-ink-500">{MONTHS[geom.minIdx] ?? ""} {year}</dd>
			</div>
			<div class="flex flex-col gap-1">
				<dt class="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-300">
					<span class="size-[7px] rounded-full" style:background-color={deficit ? TOKEN.deficit : TOKEN.einnahme}></span>
					Höchststand
				</dt>
				<dd class="text-[13.5px] font-bold tabular-nums text-ink-700">{eurCents(highCents)}</dd>
				<dd class="text-[11px] font-semibold text-ink-500">{MONTHS[geom.maxIdx] ?? ""} {year}</dd>
			</div>
		</dl>
	</div>

	<!-- Sparkline -->
	<div class="order-2 flex min-w-0 flex-1 flex-col justify-center md:order-none">
		<div bind:this={hostEl} class="relative">
			<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
			<svg
				bind:this={svgEl}
				data-testid="saldo-spark"
				viewBox={`0 0 ${vbW} ${vbH}`}
				style:aspect-ratio={`${vbW} / ${vbH}`}
				class="block h-auto w-full overflow-visible"
				role="img"
				tabindex={fineHover ? 0 : -1}
				aria-label={`Saldo-Verlauf ${year}, aktueller Stand ${eurCents(monthlyCents[current] ?? 0)}, Tiefstand ${eurCents(lowCents)} im ${MONTHS[geom.minIdx] ?? ""}, Höchststand ${eurCents(highCents)} im ${MONTHS[geom.maxIdx] ?? ""}. Werte in der Tabellenansicht.`}
				onpointermove={onMove}
				onpointerleave={onLeave}
				onkeydown={onKey}
			>
				<defs>
					<linearGradient id={`saldo-fill-${year}`} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" style:stop-color={hueLine} stop-opacity="0.22" />
						<stop offset="1" style:stop-color={hueLine} stop-opacity="0.02" />
					</linearGradient>
				</defs>

				<path d={area} fill={`url(#saldo-fill-${year})`} />

				{#if geom.hasDeficit}
					<line x1={ml} y1={r2(geom.zeroY)} x2={ml + geom.plotW} y2={r2(geom.zeroY)} style:stroke={TOKEN.baseline} stroke-width="1" />
					<text x={ml + geom.plotW} y={r2(geom.zeroY) - 5} text-anchor="end" font-size="9.5" font-weight="700" style:fill={TOKEN.ink300}>0 €</text>
				{/if}

				<path d={line} fill="none" style:stroke={hueLine} stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />

				<!-- quiet extreme rings (values live in the printed foot-stats) -->
				{#if geom.minIdx !== current}
					<circle cx={r2(minPt[0])} cy={r2(minPt[1])} r="4.4" style:fill={TOKEN.halo} style:stroke={hueLine} stroke-width="2.2" />
				{/if}
				{#if geom.maxIdx !== current}
					<circle cx={r2(maxPt[0])} cy={r2(maxPt[1])} r="4.4" style:fill={hueLine} style:stroke={TOKEN.halo} stroke-width="2" />
				{/if}

				<!-- endpoint ("you are here") -->
				<circle cx={r2(curPt[0])} cy={r2(curPt[1])} r="5.2" style:fill={hueLine} style:stroke={TOKEN.halo} stroke-width="2.6" />

				{#if actPt && fineHover}
					<line
						x1={r2(actPt[0])}
						y1={mt}
						x2={r2(actPt[0])}
						y2={r2(geom.baseY)}
						style:stroke={TOKEN.crosshair}
						stroke-width="1.25"
					/>
					<circle cx={r2(actPt[0])} cy={r2(actPt[1])} r="5.5" style:fill={hueLine} style:stroke={TOKEN.halo} stroke-width="2.4" />
				{/if}
			</svg>

			{#if fineHover}
				<div
					data-testid="saldo-readout"
					class="pointer-events-none absolute left-0 top-0 z-10 w-[232px] rounded-xl border bg-card p-3 shadow-(--shadow-card) transition-opacity duration-100"
					style={tipStyle}
					aria-hidden="true"
				>
					<div class="mb-2 flex items-center gap-2 border-b border-(--hairline) pb-2">
						<span class="size-2.5 rounded-full" style:background-color={hueLine}></span>
						<span class="text-[12.5px] font-extrabold text-ink-900">{tipMonth}</span>
					</div>
					<div class="flex items-baseline justify-between gap-3">
						<span class="text-[11.5px] font-semibold text-ink-500">Saldo</span>
						<span class="text-[14.5px] font-extrabold tabular-nums text-ink-900">{eurCents(shownCents)}</span>
					</div>
					<div class="mt-1.5 flex items-baseline justify-between gap-3">
						<span class="text-[11.5px] font-semibold text-ink-500">seit Jahresbeginn</span>
						<span class="text-[12.5px] font-bold tabular-nums" style:color={tipYtd >= 0 ? TOKEN.einnahmeStrong : TOKEN.deficitStrong}>{eurCentsSigned(tipYtd)}</span>
					</div>
					<div class="mt-1.5 flex items-baseline justify-between gap-3">
						<span class="text-[11.5px] font-semibold text-ink-500">zum Vormonat</span>
						<span class="text-[12.5px] font-bold tabular-nums" style:color={tipMom >= 0 ? TOKEN.einnahmeStrong : TOKEN.deficitStrong}>{eurCentsSigned(tipMom)}</span>
					</div>
				</div>
			{/if}
		</div>
		<div class="mt-3 flex justify-between text-[10.5px] font-bold uppercase tracking-[0.05em] tabular-nums text-ink-300">
			<span>{MONTHS[0] ?? ""} {year}</span>
			<span class="font-semibold tracking-[0.04em]">Verlauf · {N} Monats-Stände</span>
			<span>{MONTHS[current] ?? ""} {year}</span>
		</div>
	</div>

	<!-- sr-only table twin (WCAG channel — every month's stand) -->
	<table class="sr-only" data-testid="saldo-table">
		<caption>Saldo-Monatsstände Buchungsjahr {year}</caption>
		<thead><tr><th>Monat</th><th>Saldo</th></tr></thead>
		<tbody>
			{#each monthlyCents as v, i (i)}
				<tr><td>{MONTHS[i] ?? ""} {year}</td><td>{eurCents(v)}</td></tr>
			{/each}
		</tbody>
	</table>
</section>

<script lang="ts" module>
	export interface CashflowMonth {
		einnahmenCents: number;
		ausgabenCents: number;
	}
	export interface CashflowProps {
		/** 12 months of income/expense, integer cents. */
		months: CashflowMonth[];
		year: number;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * Monatlicher Cashflow (dataviz §6 cashflow-v3) — diverging columns from a
	 * shared zero (Einnahmen up green, Ausgaben down rose) under a recessive ink
	 * net-line. A month is „im Minus" purely because its net dot dips under zero.
	 * Desktop hover snaps a crosshair + one card (Einnahmen · Ausgaben · Netto);
	 * mobile prints the selected month in a fixed card below the chart.
	 */
	import { MONTHS, eurWhole, eurWholeSigned } from "../_shared/format.js";
	import { TOKEN } from "../_shared/tokens.js";
	import { barUp, barDown, monotonePath, niceAxis, r2, type Point } from "../_shared/geometry.js";
	import { watchFineHover, nearestIndex, type ChartGeo } from "../_shared/interaction.js";
	import { onMount } from "svelte";

	let { months, year, class: className }: CashflowProps = $props();

	const N = $derived(months.length);
	const net = $derived(months.map((m) => m.einnahmenCents - m.ausgabenCents));

	// geometry
	const vbW = 1180;
	const vbH = 380;
	const ml = 70;
	const mr = 24;
	const mt = 30;
	const mb = 54;
	const barW = 22;

	const axis = $derived(niceAxis(Math.max(1, ...months.map((m) => Math.max(m.einnahmenCents, m.ausgabenCents)))));
	const maxScale = $derived(axis.max);
	const ticks = $derived(axis.ticks.filter((t) => t > 0));

	const g = $derived.by(() => {
		const plotW = vbW - ml - mr;
		const plotH = vbH - mt - mb;
		const half = plotH / 2;
		const zeroY = mt + half;
		const band = plotW / N;
		const upY = (v: number) => zeroY - (v / maxScale) * half;
		const downY = (v: number) => zeroY + (v / maxScale) * half;
		const netY = (v: number) => zeroY - (v / maxScale) * half;
		const netPts: Point[] = net.map((v, i) => [ml + i * band + band / 2, netY(v)]);
		return { plotW, plotH, half, zeroY, band, upY, downY, netY, netPts };
	});
	const netPath = $derived(monotonePath(g.netPts));

	// interaction
	let fineHover = $state(false);
	onMount(() => watchFineHover((v) => (fineHover = v)));
	let activeIndex = $state<number | null>(null);
	const readoutIdx = $derived(activeIndex ?? N - 1);

	const ZERO_PT: Point = [0, 0];
	const EMPTY_MONTH: CashflowMonth = { einnahmenCents: 0, ausgabenCents: 0 };
	const actMonth = $derived(activeIndex !== null ? (months[activeIndex] ?? EMPTY_MONTH) : null);
	const actNet = $derived(activeIndex !== null ? (net[activeIndex] ?? 0) : 0);
	const actNetPt = $derived(activeIndex !== null ? (g.netPts[activeIndex] ?? ZERO_PT) : null);
	const readMonth = $derived(months[readoutIdx] ?? EMPTY_MONTH);
	const readNet = $derived(net[readoutIdx] ?? 0);

	let svgEl = $state<SVGSVGElement | null>(null);
	let hostEl = $state<HTMLDivElement | null>(null);
	let geo = $state<ChartGeo | null>(null);
	let tipStyle = $state("opacity:0");

	function measure() {
		if (!svgEl) return;
		const rect = svgEl.getBoundingClientRect();
		geo = { rect, sx: rect.width / vbW, sy: rect.height / vbH };
	}
	function placeTip() {
		if (!geo || !hostEl || activeIndex === null) {
			tipStyle = "opacity:0";
			return;
		}
		const cx = ml + activeIndex * g.band + g.band / 2;
		const hostRect = hostEl.getBoundingClientRect();
		const offX = geo.rect.left - hostRect.left;
		const px = offX + cx * geo.sx;
		const tipW = 200;
		let left = px - tipW / 2;
		if (left < 4) left = 4;
		else if (left + tipW > hostRect.width - 4) left = hostRect.width - tipW - 4;
		tipStyle = `opacity:1;transform:translate3d(${r2(left)}px,4px,0)`;
	}
	$effect(() => {
		void activeIndex;
		placeTip();
	});
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
	function onMove(e: PointerEvent) {
		if (!geo) measure();
		if (!geo) return;
		activeIndex = nearestIndex(e.clientX, geo, vbW, ml, g.plotW, N);
	}
	function onLeave() {
		if (fineHover) activeIndex = null;
	}
</script>

<div data-slot="cashflow" data-testid="cashflow" class={className}>
	<div bind:this={hostEl} class="relative">
		<svg
			bind:this={svgEl}
			viewBox={`0 0 ${vbW} ${vbH}`}
			class="block h-auto w-full overflow-visible"
			role="img"
			aria-label={`Monatlicher Cashflow ${year}: Einnahmen und Ausgaben je Monat um eine Nulllinie, mit Netto-Saldo-Linie. Werte in der Tabellenansicht.`}
			onpointermove={onMove}
			onpointerleave={onLeave}
		>
			{#each ticks as t (t)}
				<line x1={ml} y1={r2(g.upY(t))} x2={ml + g.plotW} y2={r2(g.upY(t))} style:stroke={TOKEN.hairline} stroke-width="1" />
				<line x1={ml} y1={r2(g.downY(t))} x2={ml + g.plotW} y2={r2(g.downY(t))} style:stroke={TOKEN.hairline} stroke-width="1" />
				<text x={ml - 10} y={r2(g.upY(t) + 3.3)} text-anchor="end" font-size="10" class="tabular-nums" style:fill={TOKEN.ink300}>{eurWhole(t)}</text>
				<text x={ml - 10} y={r2(g.downY(t) + 3.3)} text-anchor="end" font-size="10" class="tabular-nums" style:fill={TOKEN.ink300}>{eurWhole(t)}</text>
			{/each}

			{#if fineHover && activeIndex !== null}
				<rect x={r2(ml + activeIndex * g.band)} y={mt} width={r2(g.band)} height={r2(g.plotH)} rx="7" style:fill={TOKEN.ink900} fill-opacity="0.045" />
				<line x1={r2(ml + activeIndex * g.band + g.band / 2)} y1={mt - 4} x2={r2(ml + activeIndex * g.band + g.band / 2)} y2={mt + g.plotH + 4} style:stroke={TOKEN.ink300} stroke-width="1" />
			{/if}

			{#each months as m, i (i)}
				{@const x = ml + i * g.band + g.band / 2 - barW / 2}
				<path d={barUp(x, barW, g.upY(m.einnahmenCents), g.zeroY - 1)} style:fill={TOKEN.einnahme} />
				<path d={barDown(x, barW, g.zeroY + 1, g.downY(m.ausgabenCents))} style:fill={TOKEN.ausgabe} />
			{/each}

			<line x1={ml} y1={r2(g.zeroY)} x2={ml + g.plotW} y2={r2(g.zeroY)} style:stroke={TOKEN.ink300} stroke-width="1" />
			<text x={ml - 10} y={r2(g.zeroY + 3.3)} text-anchor="end" font-size="10" class="tabular-nums" style:fill={TOKEN.ink300}>0 €</text>

			{#each months as _m, i (i)}
				<text x={r2(ml + i * g.band + g.band / 2)} y={r2(mt + g.plotH + 30)} text-anchor="middle" font-size="11" font-weight={i === readoutIdx ? "700" : "400"} style:fill={i === readoutIdx ? TOKEN.ink900 : TOKEN.ink500}>{MONTHS[i]}</text>
			{/each}

			<path d={netPath} fill="none" style:stroke={TOKEN.card} stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round" />
			<path d={netPath} fill="none" style:stroke={TOKEN.ink700} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
			{#each g.netPts as p, i (i)}
				<circle cx={r2(p[0])} cy={r2(p[1])} r="4" style:fill={TOKEN.ink700} style:stroke={TOKEN.card} stroke-width="2" />
			{/each}

			{#if actNetPt && fineHover}
				<circle cx={r2(actNetPt[0])} cy={r2(actNetPt[1])} r="6" style:fill={TOKEN.ink700} style:stroke={TOKEN.card} stroke-width="2.5" />
			{/if}

			{#if !fineHover}
				{#each months as _m, i (i)}
					<rect x={r2(ml + i * g.band)} y={mt} width={r2(g.band)} height={r2(g.plotH)} fill="transparent" role="button" tabindex="0" aria-label={`${MONTHS[i]} ${year} auswählen`} onpointerdown={() => (activeIndex = i)} />
				{/each}
			{/if}
		</svg>

		{#if fineHover}
			<div
				data-testid="cashflow-readout"
				class="pointer-events-none absolute left-0 top-0 z-10 w-[200px] rounded-xl border bg-card p-3 shadow-(--shadow-card) transition-opacity duration-100"
				style={tipStyle}
				aria-hidden="true"
			>
				{#if actMonth && activeIndex !== null}
					<div class="mb-2 flex items-baseline justify-between border-b border-(--hairline) pb-2 text-[12.5px] font-bold text-ink-900">
						{MONTHS[activeIndex]}<span class="text-[10px] font-bold text-ink-300">{year}</span>
					</div>
					<div class="flex items-center justify-between py-0.5 text-[11.5px]">
						<span class="inline-flex items-center gap-2 text-ink-500"><span class="size-2 rounded-[2px]" style:background-color={TOKEN.einnahme}></span>Einnahmen</span>
						<span class="font-bold tabular-nums text-ink-900">{eurWhole(actMonth.einnahmenCents)}</span>
					</div>
					<div class="flex items-center justify-between py-0.5 text-[11.5px]">
						<span class="inline-flex items-center gap-2 text-ink-500"><span class="size-2 rounded-[2px]" style:background-color={TOKEN.ausgabe}></span>Ausgaben</span>
						<span class="font-bold tabular-nums text-ink-900">{eurWhole(actMonth.ausgabenCents)}</span>
					</div>
					<div class="mt-1.5 flex items-center justify-between rounded-lg bg-muted px-2 py-1.5 text-[12px]">
						<span class="font-bold text-ink-700">Netto</span>
						<span class="text-[14.5px] font-extrabold tabular-nums text-ink-900">{eurWholeSigned(actNet)}</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- mobile hover-free readout -->
	{#if !fineHover}
		<div class="mt-4 border-t border-(--hairline) pt-3.5" data-testid="cashflow-mobile-readout">
			<p class="mb-2 flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.07em] text-ink-300">
				<span class="size-[5px] rounded-full" style:background-color={TOKEN.einnahme}></span> Ausgewählter Monat · antippen zum Wechseln
			</p>
			<div class="flex items-baseline justify-between text-sm font-bold text-ink-900">{MONTHS[readoutIdx]} {year}</div>
			<div class="mt-1.5 grid grid-cols-3 gap-2 text-[12px]">
				<div><span class="block text-[10px] text-ink-500">Einnahmen</span><span class="font-bold tabular-nums text-ink-900">{eurWhole(readMonth.einnahmenCents)}</span></div>
				<div><span class="block text-[10px] text-ink-500">Ausgaben</span><span class="font-bold tabular-nums text-ink-900">{eurWhole(readMonth.ausgabenCents)}</span></div>
				<div><span class="block text-[10px] text-ink-500">Netto</span><span class="font-extrabold tabular-nums text-ink-900">{eurWholeSigned(readNet)}</span></div>
			</div>
		</div>
	{/if}

	<table class="sr-only" data-testid="cashflow-table">
		<caption>Monatlicher Cashflow {year}</caption>
		<thead><tr><th>Monat</th><th>Einnahmen</th><th>Ausgaben</th><th>Netto</th></tr></thead>
		<tbody>
			{#each months as m, i (i)}
				<tr><td>{MONTHS[i]} {year}</td><td>{eurWhole(m.einnahmenCents)}</td><td>{eurWhole(m.ausgabenCents)}</td><td>{eurWholeSigned(net[i] ?? 0)}</td></tr>
			{/each}
		</tbody>
	</table>
</div>

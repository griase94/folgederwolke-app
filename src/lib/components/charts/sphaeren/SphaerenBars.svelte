<script lang="ts" module>
	import type { Sphere } from "$lib/domain/sphere.js";

	export interface SphaerenRow {
		sphere: Sphere;
		/** Amount for this sphere, integer cents (may be negative = deficit). */
		cents: number;
	}
	export interface SphaerenBarsProps {
		rows: SphaerenRow[];
		/** Heading noun for the total ("Einnahmen gesamt" by default). */
		totalLabel?: string;
		/** Compact HTML variant for dashboard cards (no SVG, no hover). */
		dense?: boolean;
		/**
		 * Print the Anteil % beside each betrag. True for a true composition
		 * (Einnahmen split); false for net saldi, where a share of the total is
		 * not meaningful.
		 */
		showShares?: boolean;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * Sphären-Komposition (dataviz §6 sphaere-v7) — sorted horizontal bars in the
	 * four frozen Sphären hues, biggest first, betrag + share direct-labelled at
	 * the bar end. A deficit sphere grows LEFT of zero, form unchanged (§5). The
	 * full variant adds a desktop hover detail card; `dense` renders compact
	 * reflow-safe HTML bars for a dashboard card, every value printed.
	 */
	import { SPHERE_LABELS } from "$lib/domain/sphere.js";
	import { eurWhole, pctWhole } from "../_shared/format.js";
	import { SPHERE_VAR, TOKEN } from "../_shared/tokens.js";
	import { barLeft, barRight, niceAxis, r2 } from "../_shared/geometry.js";
	import { watchFineHover, type ChartGeo } from "../_shared/interaction.js";
	import { onMount } from "svelte";

	let {
		rows,
		totalLabel = "Einnahmen gesamt",
		dense = false,
		showShares = true,
		class: className,
	}: SphaerenBarsProps = $props();

	const sorted = $derived([...rows].sort((a, b) => b.cents - a.cents));
	const total = $derived(sorted.reduce((a, r) => a + r.cents, 0));
	const maxPos = $derived(Math.max(0, ...sorted.map((r) => r.cents)));
	const minVal = $derived(Math.min(0, ...sorted.map((r) => r.cents)));
	// Shares are a fraction of the POSITIVE sum, so a deficit sphere never pushes
	// the others past 100 % (dataviz sphaere-v7 deficit variant).
	const shareBase = $derived(sorted.reduce((a, r) => a + Math.max(0, r.cents), 0));

	function share(cents: number): number | null {
		return showShares && cents >= 0 && shareBase > 0
			? Math.round((cents / shareBase) * 100)
			: null;
	}

	// ── full SVG geometry ──────────────────────────────────────────────────
	const vbW = 1200;
	const ml = 288;
	const mr = 176;
	const mt = 10;
	const rowH = 52;
	const barH = 22;
	const axisH = 26;
	const plotW = vbW - ml - mr;
	const vbH = $derived(mt + sorted.length * rowH + axisH);

	const axis = $derived(niceAxis(maxPos, minVal));
	const dLo = $derived(axis.min);
	const dHi = $derived(axis.max);
	const xFor = $derived((v: number) => ml + ((v - dLo) / (dHi - dLo || 1)) * plotW);
	const zeroX = $derived(xFor(0));

	let fineHover = $state(false);
	onMount(() => watchFineHover((v) => (fineHover = v)));
	let activeIndex = $state<number | null>(null);
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
		const r = sorted[activeIndex];
		if (!r) {
			tipStyle = "opacity:0";
			return;
		}
		const yTop = mt + activeIndex * rowH + rowH / 2;
		const hostRect = hostEl.getBoundingClientRect();
		const offX = geo.rect.left - hostRect.left;
		const offY = geo.rect.top - hostRect.top;
		const barTipVb = r.cents >= 0 ? xFor(r.cents) : xFor(r.cents);
		const px = offX + barTipVb * geo.sx;
		const py = offY + yTop * geo.sy;
		const tipW = 210;
		let cx = px + (r.cents >= 0 ? 12 : -12 - tipW);
		const hw = hostRect.width;
		if (cx < 4) cx = 4;
		else if (cx + tipW > hw - 4) cx = hw - tipW - 4;
		tipStyle = `opacity:1;transform:translate3d(${r2(cx)}px,${r2(py - 44)}px,0)`;
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
	function activate(i: number) {
		if (!fineHover) return;
		activeIndex = i;
	}
	function clearActive() {
		activeIndex = null;
	}
</script>

{#if dense}
	<div data-slot="sphaeren-bars" data-testid="sphaeren-bars-dense" class={["flex flex-col gap-3", className]}>
		{#each sorted as row (row.sphere)}
			{@const s = share(row.cents)}
			{@const neg = row.cents < 0}
			{@const maxNeg = Math.abs(minVal)}
			{@const zeroPct = maxNeg > 0 ? (maxNeg / (maxNeg + maxPos)) * 100 : 0}
			{@const posW = maxPos > 0 ? (Math.max(row.cents, 0) / maxPos) * (100 - zeroPct) : 0}
			{@const negW = maxNeg > 0 ? (Math.abs(Math.min(row.cents, 0)) / maxNeg) * zeroPct : 0}
			<div data-testid={`sphaere-row-${row.sphere}`}>
				<div class="flex items-start justify-between gap-2">
					<span class="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink-900">
						<span class="size-2.5 flex-none rounded-[3px]" style:background-color={SPHERE_VAR[row.sphere]}></span>
						<span class="truncate">{SPHERE_LABELS[row.sphere]}</span>
					</span>
					<span class="flex flex-none items-baseline gap-2 tabular-nums">
						<span class="text-[13px] font-bold" style:color={neg ? TOKEN.deficitStrong : TOKEN.ink900}>{eurWhole(row.cents)}</span>
						{#if s !== null}<span class="min-w-[3.5ch] text-right text-[11px] font-bold text-ink-500">{pctWhole(s)}</span>{/if}
					</span>
				</div>
				<div class="relative mt-1.5 h-[10px] overflow-hidden rounded-[5px]" style:background-color={TOKEN.track}>
					{#if minVal < 0}
						<div class="absolute inset-y-[-2px] w-px" style:left={`${zeroPct}%`} style:background-color={TOKEN.ink300}></div>
					{/if}
					{#if neg}
						<div class="absolute inset-y-0 rounded-l-[5px]" style:right={`${100 - zeroPct}%`} style:width={`${negW}%`} style:background-color={TOKEN.deficit}></div>
					{:else}
						<div class="absolute inset-y-0 rounded-r-[5px]" style:left={`${zeroPct}%`} style:width={`${posW}%`} style:background-color={SPHERE_VAR[row.sphere]}></div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{:else}
	<div data-slot="sphaeren-bars" data-testid="sphaeren-bars" class={["relative", className]} bind:this={hostEl}>
		<svg
			bind:this={svgEl}
			viewBox={`0 0 ${vbW} ${vbH}`}
			class="block h-auto w-full overflow-visible"
			role="img"
			aria-label={`Sortierte horizontale Balken: ${totalLabel} je Gemeinnützigkeits-Sphäre, Gesamt ${eurWhole(total)}`}
		>
			{#each axis.ticks as t (t)}
				<line x1={r2(xFor(t))} y1={mt - 2} x2={r2(xFor(t))} y2={mt + sorted.length * rowH + 2} style:stroke={TOKEN.hairline} stroke-width="1" />
			{/each}
			{#if minVal < 0}
				<line x1={r2(zeroX)} y1={mt - 4} x2={r2(zeroX)} y2={mt + sorted.length * rowH + 2} style:stroke={TOKEN.ink300} stroke-width="1" />
			{/if}

			{#each sorted as row, i (row.sphere)}
				{@const yTop = mt + i * rowH}
				{@const y = yTop + (rowH - barH) / 2}
				{@const s = share(row.cents)}
				<g>
					{#if activeIndex === i}
						<rect x="8" y={r2(yTop + 2)} width={vbW - 16} height={rowH - 4} rx="7" style:fill={TOKEN.ink900} fill-opacity="0.05" />
					{/if}
					{#if row.cents >= 0}
						<path d={barRight(zeroX, y, xFor(row.cents) - zeroX, barH)} style:fill={SPHERE_VAR[row.sphere]} />
						<text x={r2(xFor(row.cents) + 12)} y={r2(y + barH / 2 + 4.5)} text-anchor="start" font-size="13" font-weight="750" class="tabular-nums" style:fill={TOKEN.ink900}>
							{eurWhole(row.cents)}<tspan dx="8" font-size="11" font-weight="700" style:fill={TOKEN.ink500}>{s !== null ? pctWhole(s) : ""}</tspan>
						</text>
					{:else}
						<path d={barLeft(zeroX, y, zeroX - xFor(row.cents), barH)} style:fill={TOKEN.deficit} />
						<text x={r2(xFor(row.cents) - 12)} y={r2(y + barH / 2 + 4.5)} text-anchor="end" font-size="13" font-weight="750" class="tabular-nums" style:fill={TOKEN.deficitStrong}>{eurWhole(row.cents)}</text>
					{/if}
					<text x={r2(ml - 18)} y={r2(y + barH / 2 + 4.5)} text-anchor="end" font-size="13" font-weight="650" style:fill={TOKEN.ink900}>{SPHERE_LABELS[row.sphere]}</text>
					<rect
						x="0"
						y={r2(yTop)}
						width={vbW}
						height={rowH}
						fill="transparent"
						role="img"
						aria-label={`${SPHERE_LABELS[row.sphere]}: ${eurWhole(row.cents)}${s !== null ? `, ${s} Prozent` : ""}`}
						onpointerenter={() => activate(i)}
						onpointermove={() => activate(i)}
						onpointerleave={clearActive}
					/>
				</g>
			{/each}
			<text x={r2(zeroX)} y={r2(mt + sorted.length * rowH + 18)} text-anchor="middle" font-size="10.5" font-weight="600" class="tabular-nums" style:fill={TOKEN.ink300}>0 €</text>
		</svg>

		{#if fineHover}
			<div
				data-testid="sphaeren-readout"
				class="pointer-events-none absolute left-0 top-0 z-10 w-[210px] rounded-xl border bg-card p-3 shadow-(--shadow-card) transition-opacity duration-100"
				style={tipStyle}
				aria-hidden="true"
			>
				{#if activeIndex !== null && sorted[activeIndex]}
					{@const row = sorted[activeIndex]!}
					<div class="flex items-center gap-2">
						<span class="size-2.5 flex-none rounded-[3px]" style:background-color={row.cents < 0 ? TOKEN.deficit : SPHERE_VAR[row.sphere]}></span>
						<span class="text-[11.5px] font-semibold text-ink-700">{SPHERE_LABELS[row.sphere]}</span>
					</div>
					<div class="mt-1 text-[22px] font-extrabold tabular-nums text-ink-900">{eurWhole(row.cents)}</div>
					<div class="mt-2 flex flex-col gap-1.5 border-t border-(--hairline) pt-2 text-[11.5px]">
						<div class="flex items-baseline justify-between gap-3">
							<span class="text-ink-500">Anteil</span>
							<span class="font-bold tabular-nums text-ink-900">{share(row.cents) !== null ? pctWhole(share(row.cents)!) : "—"}</span>
						</div>
						<div class="flex items-baseline justify-between gap-3">
							<span class="text-ink-500">vom Gesamt</span>
							<span class="font-bold tabular-nums text-ink-900">{eurWhole(total)}</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<table class="sr-only" data-testid="sphaeren-table">
			<caption>{totalLabel} je Sphäre</caption>
			<thead><tr><th>Sphäre</th><th>Betrag</th><th>Anteil</th></tr></thead>
			<tbody>
				{#each sorted as row (row.sphere)}
					<tr><td>{SPHERE_LABELS[row.sphere]}</td><td>{eurWhole(row.cents)}</td><td>{share(row.cents) !== null ? pctWhole(share(row.cents)!) : "—"}</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

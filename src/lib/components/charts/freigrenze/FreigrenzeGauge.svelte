<script lang="ts" module>
	export interface FreigrenzeGaugeProps {
		/** Umsatz wirtschaftlicher Geschäftsbetrieb, integer cents. */
		umsatzCents: number;
		/** §64 Freigrenze, integer cents (default 50.000 €). */
		capCents?: number;
		/** Warn threshold as a fraction of the cap (default 0.8 = 40.000 €). */
		warnFraction?: number;
		year: number;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * Wirtschaftlicher Spielraum §64 (dataviz §6 freigrenze-v5) — an arc gauge:
	 * one ratio (Umsatz) against the fixed 50.000 € Freigrenze, hero € in the
	 * middle, a green→amber „Achtung"→red „Steuerpflichtig" zone track, plus a
	 * linear zone-bar restating where the Verein sits. The readout is always
	 * visible; no interaction needed.
	 */
	import { eurWhole, pctOne } from "../_shared/format.js";
	import { TOKEN } from "../_shared/tokens.js";
	import { gaugeArc, gaugePoint, clamp, r2 } from "../_shared/geometry.js";

	let {
		umsatzCents,
		capCents = 5_000_000,
		warnFraction = 0.8,
		year,
		class: className,
	}: FreigrenzeGaugeProps = $props();

	const CX = 200;
	const CY = 208;
	const R = 166;

	const frac = $derived(capCents > 0 ? umsatzCents / capCents : 0);
	const cl = $derived(clamp(frac, 0, 1));
	const state = $derived(
		umsatzCents >= capCents ? "over" : frac >= warnFraction ? "warn" : "safe",
	);
	const arcColor = $derived(
		state === "over" ? TOKEN.over : state === "warn" ? TOKEN.warn : TOKEN.einnahme,
	);
	const stateText = $derived(
		state === "over" ? TOKEN.overText : state === "warn" ? TOKEN.warnText : TOKEN.einnahmeStrong,
	);
	const spielraumCents = $derived(capCents - umsatzCents);

	// radial tick endpoints
	function radial(f: number, rIn: number, rOut: number) {
		const p0 = gaugePoint(CX, CY, rIn, f);
		const p1 = gaugePoint(CX, CY, rOut, f);
		return { x1: r2(p0[0]), y1: r2(p0[1]), x2: r2(p1[0]), y2: r2(p1[1]) };
	}
	const warnTick = $derived(radial(warnFraction, R - 15, R + 15));
	const warnCase = $derived(radial(warnFraction, R - 17, R + 17));
	const warnLabelPt = $derived(gaugePoint(CX, CY, R + 28, warnFraction));
	const capTick = $derived(radial(1, R - 17, R + 17));
	const marker = $derived(gaugePoint(CX, CY, R, cl));

	const trackArc = gaugeArc(CX, CY, R, 0, 1);
	const amberArc = $derived(gaugeArc(CX, CY, R, warnFraction, 1));
	const valueArc = $derived(gaugeArc(CX, CY, R, 0, Math.max(cl, 0.001)));
</script>

<div data-slot="freigrenze-gauge" data-testid="freigrenze-gauge" class={["flex flex-col items-center", className]}>
	<div class="relative w-full max-w-[400px]">
		<svg
			viewBox="0 0 400 236"
			style:aspect-ratio="400 / 236"
			class="block h-auto w-full overflow-visible"
			role="img"
			aria-label={`Umsatz wirtschaftlicher Geschäftsbetrieb ${year}: ${eurWhole(umsatzCents)}, ${pctOne(frac * 100)} der ${eurWhole(capCents)}-Freigrenze, Zustand ${state === "over" ? "steuerpflichtig" : state === "warn" ? "Achtung" : "sicher"}`}
		>
			<path d={trackArc} fill="none" style:stroke={TOKEN.track} stroke-width="22" stroke-linecap="round" />
			<path d={amberArc} fill="none" style:stroke={TOKEN.warn} stroke-width="22" stroke-linecap="butt" opacity="0.18" />
			<path d={valueArc} fill="none" style:stroke={arcColor} stroke-width="22" stroke-linecap="round" />

			<line x1={warnCase.x1} y1={warnCase.y1} x2={warnCase.x2} y2={warnCase.y2} style:stroke={TOKEN.card} stroke-width="6" stroke-linecap="round" />
			<line x1={warnTick.x1} y1={warnTick.y1} x2={warnTick.x2} y2={warnTick.y2} style:stroke={TOKEN.warn} stroke-width="2.5" stroke-linecap="round" />
			<text x={r2(warnLabelPt[0])} y={r2(warnLabelPt[1])} text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="750" class="tabular-nums" style:fill={TOKEN.warnText}>{eurWhole(capCents * warnFraction)}</text>

			<line x1={capTick.x1} y1={capTick.y1} x2={capTick.x2} y2={capTick.y2} style:stroke={TOKEN.over} stroke-width="3" stroke-linecap="round" opacity="0.9" />

			<circle cx={r2(marker[0])} cy={r2(marker[1])} r="11" style:fill={TOKEN.card} />
			<circle cx={r2(marker[0])} cy={r2(marker[1])} r="7.5" style:fill={arcColor} />
			<circle cx={r2(marker[0])} cy={r2(marker[1])} r="2.6" style:fill={TOKEN.card} />
		</svg>

		<div class="pointer-events-none absolute inset-x-0 bottom-1.5 flex flex-col items-center gap-0.5">
			<span class="text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-300">Umsatz · {year}</span>
			<span data-testid="freigrenze-hero" class="text-[42px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-ink-900">{eurWhole(umsatzCents)}</span>
			<span class="text-[12.5px] font-bold text-ink-500"><span class="font-extrabold" style:color={stateText}>{pctOne(frac * 100)}</span> der Freigrenze</span>
		</div>
	</div>

	<div class="mt-1 flex w-full max-w-[392px] justify-between text-[11px] font-semibold tabular-nums text-ink-300">
		<span>0 €</span>
		<span>{eurWhole(capCents)} · Freigrenze</span>
	</div>

	<!-- linear zone-bar -->
	<div class="mt-5 w-full max-w-[400px] border-t border-(--hairline) pt-4">
		<p class="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-300">Wo steht der Verein auf der Skala</p>
		<div class="relative mt-7 h-[13px] rounded-[7px]" style:background={`linear-gradient(90deg, var(--einnahme-strong) 0%, ${TOKEN.einnahme} 55%, ${TOKEN.einnahme} ${warnFraction * 100}%, ${TOKEN.warn} ${warnFraction * 100}%, ${TOKEN.warn} 100%)`}>
			<span class="absolute inset-y-[-2px] right-[-3px] w-[5px] rounded-sm" style:background-color={TOKEN.over}></span>
			<span class="absolute inset-y-[-6px] w-[3px] -translate-x-1/2 rounded-sm" style:left={`${clamp(frac, 0, 1) * 100}%`} style:background-color={TOKEN.ink900} style:box-shadow={`0 0 0 3px ${TOKEN.card}`}>
				<span class="absolute -top-[22px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-extrabold tabular-nums text-ink-900">{eurWhole(umsatzCents)}</span>
			</span>
		</div>
		<!-- Endpoints only — the warn threshold (40.000 €) is already labelled on
		     the arc tick, so the mid label is dropped to avoid an end-collision. -->
		<div class="relative mt-2 h-[13px] text-[10.5px] font-bold tabular-nums text-ink-300">
			<span class="absolute left-0">0 €</span>
			<span class="absolute right-0">{eurWhole(capCents)}</span>
		</div>
		<p class="mt-4 text-[12px] text-ink-500" data-testid="freigrenze-spielraum">
			{#if spielraumCents >= 0}
				Freier Spielraum bis zur Freigrenze: <b class="font-bold" style:color={stateText}>{eurWhole(spielraumCents)}</b>
			{:else}
				Über der Freigrenze: <b class="font-bold" style:color={TOKEN.overText}>{eurWhole(-spielraumCents)}</b>
			{/if}
		</p>
	</div>
</div>

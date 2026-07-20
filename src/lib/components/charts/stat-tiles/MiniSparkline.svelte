<script lang="ts" module>
	export interface MiniSparklineProps {
		/** Series values (integer cents or any unit — only the shape is drawn). */
		series: number[];
		/** Height in px (default 120). */
		height?: number;
		class?: string;
		/** Accessible label describing the series. */
		label?: string;
	}
</script>

<script lang="ts">
	/**
	 * Area sparkline (dataviz §6 stat-tiles Saldo) — an achs-less green area +
	 * line filling the tile width. `preserveAspectRatio="none"` stretches the path
	 * to the tile; the round endpoint marker is an HTML overlay so it never
	 * egg-shapes under the stretch. Deficit-aware: the line flips to rose if the
	 * closing value is negative.
	 */
	import { TOKEN } from "../_shared/tokens.js";
	import { linePath, areaFromLine, type Point } from "../_shared/geometry.js";

	let { series, height = 120, class: className, label }: MiniSparklineProps = $props();

	const vbW = 300;
	const vbH = 110;
	const pad = { l: 4, r: 4, t: 12, b: 10 };

	const geom = $derived.by(() => {
		const plotW = vbW - pad.l - pad.r;
		const plotH = vbH - pad.t - pad.b;
		const lo = Math.min(...series);
		const hi = Math.max(...series);
		const span = hi - lo || 1;
		const n = series.length;
		const pts: Point[] = series.map((v, i) => [
			pad.l + (i / (n - 1 || 1)) * plotW,
			pad.t + (1 - (v - lo) / span) * plotH,
		]);
		const base = vbH - pad.b;
		const last = pts[n - 1] ?? [pad.l, base];
		return {
			pts,
			base,
			lastPctX: (last[0] / vbW) * 100,
			lastPctY: (last[1] / vbH) * 100,
		};
	});
	const line = $derived(linePath(geom.pts));
	const area = $derived(areaFromLine(line, geom.pts, geom.base));
	const deficit = $derived((series[series.length - 1] ?? 0) < 0);
	const hue = $derived(deficit ? TOKEN.deficit : TOKEN.einnahme);
	const gid = $derived(`mini-spark-${Math.round(series.reduce((a, b) => a + b, 0))}`);
</script>

<div data-slot="mini-sparkline" data-testid="mini-sparkline" class={["relative", className]} style:height={`${height}px`}>
	<svg viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="none" class="block size-full overflow-visible" role="img" aria-label={label ?? "Verlauf"}>
		<defs>
			<linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" style:stop-color={hue} stop-opacity="0.2" />
				<stop offset="1" style:stop-color={hue} stop-opacity="0" />
			</linearGradient>
		</defs>
		<path d={area} fill={`url(#${gid})`} />
		<path d={line} fill="none" style:stroke={hue} stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
	</svg>
	<span
		class="pointer-events-none absolute size-[11.6px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.4px]"
		style:left={`${geom.lastPctX}%`}
		style:top={`${geom.lastPctY}%`}
		style:border-color={TOKEN.card}
		style:background-color={hue}
	></span>
</div>

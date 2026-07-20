<script lang="ts" module>
	export interface ProgressRingProps {
		/** Numerator, e.g. members who paid. */
		value: number;
		/** Denominator, e.g. members liable. */
		total: number;
		/** Caption under the percent (default "gezahlt"). */
		caption?: string;
		/** Ring diameter in px (default 76). */
		size?: number;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * Proportional ring (dataviz §5 "many members → ring + absolute") — the
	 * "17 von 20 · 85 %" quote as an arc, never boxes-per-member. Green value arc
	 * on a recessive track, percent + caption at the centre.
	 */
	import { TOKEN } from "../_shared/tokens.js";
	import { ringDash } from "../_shared/geometry.js";

	let { value, total, caption = "gezahlt", size = 76, class: className }: ProgressRingProps =
		$props();

	const pct = $derived(total > 0 ? Math.round((value / total) * 100) : 0);
	const R = 33;
	const dash = $derived(ringDash(R, pct));
</script>

<svg
	data-slot="progress-ring"
	data-testid="progress-ring"
	viewBox="0 0 84 84"
	width={size}
	height={size}
	class={["flex-none", className]}
	role="img"
	aria-label={`${value} von ${total}, ${pct} Prozent ${caption}`}
>
	<circle cx="42" cy="42" r={R} fill="none" style:stroke={TOKEN.ringTrack} stroke-width="8.5" />
	<circle
		cx="42"
		cy="42"
		r={R}
		fill="none"
		style:stroke={TOKEN.einnahme}
		stroke-width="8.5"
		stroke-linecap="round"
		stroke-dasharray={dash.circumference.toFixed(2)}
		stroke-dashoffset={dash.offset.toFixed(2)}
		transform="rotate(-90 42 42)"
	/>
	<text x="42" y="41" text-anchor="middle" dominant-baseline="middle" font-size="21" font-weight="800" style:fill={TOKEN.ink900}>
		{pct}<tspan font-size="12" dx="2.5">%</tspan>
	</text>
	<text x="42" y="57" text-anchor="middle" font-size="7.5" font-weight="700" letter-spacing="0.06em" style:fill={TOKEN.ink500}>{caption.toUpperCase()}</text>
</svg>

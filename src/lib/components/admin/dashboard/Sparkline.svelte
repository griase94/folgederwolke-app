<script lang="ts" module>
	/**
	 * Lightweight, hand-rolled sparkline. Inline SVG, no external library
	 * (no `pnpm add` allowed). 12 data points typical (one per month).
	 *
	 *   - Normalizes data to [pad, height-pad] vertically.
	 *   - Single <polyline> for the trend, single <circle> at the latest point.
	 *   - All-zero / single-non-zero series degrade gracefully (flat line).
	 */
	export interface SparklineProps {
		/** Numeric series (cents or any number). 12 typical, 0–48 supported. */
		data: number[];
		/** SVG width in user-units (defaults to 120). */
		width?: number;
		/** SVG height in user-units (defaults to 36). */
		height?: number;
		/** Stroke color of the polyline (defaults to currentColor). */
		stroke?: string;
		/** Optional tone for color: 'positive' | 'negative' | 'neutral'. */
		tone?: 'positive' | 'negative' | 'neutral';
		/** Optional CSS class. */
		class?: string;
	}

	/** Pure helper: turns `data` into an SVG `points` string. Exported for unit tests. */
	export function computePoints(
		data: number[],
		width: number,
		height: number,
		pad = 2,
	): string {
		if (data.length === 0) return '';
		const n = data.length;
		const min = Math.min(...data);
		const max = Math.max(...data);
		const range = max - min;
		const innerH = height - pad * 2;
		const stepX = n > 1 ? (width - pad * 2) / (n - 1) : 0;

		return data
			.map((v, i) => {
				const x = pad + i * stepX;
				// Inverted y: high values → low y (top of SVG).
				const y = range === 0 ? height / 2 : pad + innerH - ((v - min) / range) * innerH;
				return `${x.toFixed(2)},${y.toFixed(2)}`;
			})
			.join(' ');
	}
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';

	let {
		data,
		width = 120,
		height = 36,
		stroke,
		tone = 'neutral',
		class: className,
	}: SparklineProps = $props();

	const points = $derived(computePoints(data, width, height));
	const last = $derived(() => {
		if (data.length === 0) return null;
		const parts = points.split(' ');
		const lastPart = parts[parts.length - 1]?.split(',');
		if (!lastPart || lastPart.length < 2) return null;
		return { x: Number(lastPart[0]), y: Number(lastPart[1]) };
	});

	const toneClass = $derived(
		tone === 'positive'
			? 'text-emerald-600 dark:text-emerald-500'
			: tone === 'negative'
				? 'text-rose-600 dark:text-rose-500'
				: 'text-muted-foreground'
	);
</script>

<svg
	data-testid="sparkline"
	class={cn('sparkline overflow-visible', toneClass, className)}
	viewBox={`0 0 ${width} ${height}`}
	width={width}
	height={height}
	aria-hidden="true"
	role="img"
>
	<polyline
		points={points}
		fill="none"
		stroke={stroke ?? 'currentColor'}
		stroke-width="1.5"
		stroke-linejoin="round"
		stroke-linecap="round"
		vector-effect="non-scaling-stroke"
	/>
	{#if last() !== null}
		<circle
			data-role="sparkline-latest"
			cx={last()!.x}
			cy={last()!.y}
			r="2"
			fill={stroke ?? 'currentColor'}
		/>
	{/if}
</svg>

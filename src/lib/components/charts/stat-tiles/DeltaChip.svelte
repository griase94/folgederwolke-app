<script lang="ts" module>
	export interface DeltaChipProps {
		/** Einnahmen (income) in the bucket, integer cents. */
		einnahmenCents: number;
		/** Ausgaben (expense) in the bucket, integer cents. */
		ausgabenCents: number;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * DeltaChip (dataviz §6 stat-tiles) — a ≤12px twin stub: a green up-stub
	 * (Einnahmen) and a rose down-stub (Ausgaben) sharing one zero line, sized to
	 * the larger of the two. It sits in the Transaktionen month-head directly
	 * before the printed Netto amount and answers, at a glance, whether the month
	 * was carried by income or by spending. Deliberately tiny, hover-free — the
	 * exact figure stays printed next to it (the chip is decorative → aria-hidden;
	 * the net amount carries the meaning for assistive tech).
	 *
	 * Token-only colours (dataviz §2): a theme flip repaints it with everything
	 * else. Zero magnitude on a side omits that stub entirely.
	 */
	import { TOKEN } from "../_shared/tokens.js";

	let { einnahmenCents, ausgabenCents, class: className }: DeltaChipProps = $props();

	// Shared scale keyed to the larger side; `1` guards div-by-zero when both
	// are 0 (both stubs then omitted). Max stub height = 5 of the 12-tall box.
	const hi = $derived(Math.max(einnahmenCents, ausgabenCents, 1));
	const upH = $derived(einnahmenCents > 0 ? Math.max(1, (einnahmenCents / hi) * 5) : 0);
	const dnH = $derived(ausgabenCents > 0 ? Math.max(1, (ausgabenCents / hi) * 5) : 0);
</script>

<svg
	class={["inline-block flex-none align-middle", className]}
	width="13"
	height="12"
	viewBox="0 0 13 12"
	aria-hidden="true"
>
	<line x1="0.5" y1="6" x2="12.5" y2="6" stroke={TOKEN.ink300} stroke-width="0.7" />
	{#if upH > 0}
		<rect x="3" y={6 - upH} width="3" height={upH} rx="1" fill={TOKEN.einnahme} />
	{/if}
	{#if dnH > 0}
		<rect x="7" y="6" width="3" height={dnH} rx="1" fill={TOKEN.ausgabe} />
	{/if}
</svg>

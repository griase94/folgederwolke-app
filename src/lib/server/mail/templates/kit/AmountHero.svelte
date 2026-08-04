<script lang="ts">
	/**
	 * AmountHero — the one salient fact of a mail: the amount.
	 *
	 * The accent lives in the top border, the digit stays plum. Green may say
	 * "approved" through the chrome; it may never colour the money (briefs §4).
	 *
	 * The accent is a real 4px `border-top` on a real element, never a gradient
	 * or a ::before pseudo — Gmail and Outlook strip both (Abnahme #24).
	 */
	import { BRAND_PRIMARY_STRONG } from '$lib/brand.js';
	import { EMERALD, INK_500, INK_700, PLUM, SURFACE_TINT } from './tokens.js';

	let {
		eyebrow,
		amount,
		meta = '',
		accent = 'brand'
	}: {
		eyebrow: string;
		/** Pre-formatted de-DE EUR string (cents-only rule lives in the caller). */
		amount: string;
		meta?: string;
		accent?: 'brand' | 'emerald';
	} = $props();

	const accentColor = $derived(accent === 'emerald' ? EMERALD : BRAND_PRIMARY_STRONG);
</script>

<div
	style="background:{SURFACE_TINT};border-radius:12px;border-top:4px solid {accentColor};padding:17px 20px 16px;margin:0 0 18px;"
>
	<p
		style="margin:6px 0 3px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:{INK_500};"
	>
		{eyebrow}
	</p>
	<p
		style="margin:0;font-size:34px;font-weight:800;color:{PLUM};letter-spacing:-0.02em;line-height:1.02;font-variant-numeric:tabular-nums;"
	>
		{amount}
	</p>
	{#if meta}
		<p style="margin:8px 0 0 0;font-size:12.5px;color:{INK_500};">
			<strong style="color:{INK_700};font-weight:600;">{meta}</strong>
		</p>
	{/if}
</div>

<script lang="ts">
	/**
	 * PaidCard — the emerald "money is out" card of the Erstattungs-Mail.
	 *
	 * The ONLY green detail card in the suite: green earns its place exactly once,
	 * where it means "you got your money back" (mail-auslage-erstattet.md §4). The
	 * amount inside it is still plum and still the largest element of the mail.
	 *
	 * The rows go through the shared DetailCard renderer (surface="bare") so the
	 * label ruler and the mono/tabular rules are the same ones every other mail
	 * uses — the card only changes the surface and the two text colours.
	 */
	import DetailCard, { type MailFactRow } from './DetailCard.svelte';
	import { EMERALD_TEXT, PAID_BG, PAID_BORDER, PAID_LABEL, PLUM } from './tokens.js';

	let {
		eyebrow,
		amount,
		sub,
		rows
	}: {
		eyebrow: string;
		/** Pre-formatted de-DE EUR string. */
		amount: string;
		sub: string;
		rows: MailFactRow[];
	} = $props();
</script>

<div
	style="background:{PAID_BG};border:1px solid {PAID_BORDER};border-radius:12px;padding:17px 20px 16px;margin:0 0 18px;"
>
	<p
		style="margin:0 0 5px 0;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:{EMERALD_TEXT};"
	>
		<!-- Emerald dot instead of the plate's circle-check glyph: Gmail strips SVG. -->
		<span
			style="display:inline-block;width:7px;height:7px;border-radius:50%;background:{EMERALD_TEXT};vertical-align:1px;margin-right:7px;"
		></span>{eyebrow}
	</p>
	<p
		style="margin:0 0 4px 0;font-size:32px;font-weight:800;color:{PLUM};letter-spacing:-0.02em;line-height:1.04;font-variant-numeric:tabular-nums;"
	>
		{amount}
	</p>
	<p style="margin:0 0 14px 0;font-size:12.5px;font-weight:600;color:{PAID_LABEL};">{sub}</p>
	<div style="border-top:1px solid {PAID_BORDER};margin:0 0 12px 0;font-size:1px;line-height:1px;">
		&nbsp;
	</div>
	<DetailCard {rows} surface="bare" tone="paid" />
</div>

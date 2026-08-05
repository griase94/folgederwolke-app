<script lang="ts">
	/**
	 * ChipLead — the status pill above the H1 ("Genehmigt", "Überwiesen",
	 * "Korrektur nötig").
	 *
	 * `neutral` is deliberately available and deliberately not red: a rejection
	 * is "needs a correction", not an alarm (mail-auslage-abgelehnt.md §7). The
	 * only warn colour in the suite is the amber Grund-Box.
	 *
	 * The dot is a styled span, not an icon — Gmail strips SVG.
	 */
	import { EMERALD, EMERALD_TEXT, EMERALD_TINT, INK_500, NEUTRAL_DOT, NEUTRAL_TINT } from './tokens.js';

	let { label, tone = 'neutral' }: { label: string; tone?: 'success' | 'neutral' } = $props();

	const bg = $derived(tone === 'success' ? EMERALD_TINT : NEUTRAL_TINT);
	const fg = $derived(tone === 'success' ? EMERALD_TEXT : INK_500);
	const dot = $derived(tone === 'success' ? EMERALD : NEUTRAL_DOT);
</script>

<p style="margin:0 0 14px 0;">
	<span
		style="display:inline-block;background:{bg};color:{fg};font-size:12px;font-weight:700;line-height:1;padding:6px 12px 6px 10px;border-radius:99px;letter-spacing:0.02em;"
		><span
			style="display:inline-block;width:7px;height:7px;border-radius:50%;background:{dot};vertical-align:1px;margin-right:7px;"
		></span>{label}</span
	>
</p>

<script lang="ts">
	/**
	 * GrundBox — the rejection reason, verbatim.
	 *
	 * The text comes from the treasurer's Reject-Modal and is rendered 1:1: never
	 * reworded, never truncated, never decorated (mail-auslage-abgelehnt.md §3).
	 * The warm framing around it is the template's job; this box stays sober.
	 *
	 * `white-space:pre-line` preserves the line breaks a multi-line reason was
	 * typed with — the plate shows one paragraph, but a treasurer who writes two
	 * should not have them collapsed.
	 */
	import { AMBER_BAR, AMBER_BG, AMBER_BODY, AMBER_TEXT } from './tokens.js';

	let { title, text }: { title: string; text: string } = $props();
</script>

<div
	style="background:{AMBER_BG};border-left:4px solid {AMBER_BAR};border-radius:10px;padding:15px 18px;margin:0 0 18px;"
>
	<p
		style="margin:0 0 8px 0;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:{AMBER_TEXT};"
	>
		<!-- Amber dot instead of the plate's triangle-alert glyph: Gmail strips SVG. -->
		<span
			style="display:inline-block;width:7px;height:7px;border-radius:50%;background:{AMBER_BAR};vertical-align:1px;margin-right:7px;"
		></span>{title}
	</p>
	<p style="margin:0;font-size:14.5px;line-height:1.55;color:{AMBER_BODY};white-space:pre-line;">
		{text}
	</p>
</div>

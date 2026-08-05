<script lang="ts">
	/**
	 * NextStep — the "Wie es weitergeht" callout.
	 *
	 * Answers the one question a status mail leaves open: what happens now, and
	 * do I have to do anything? Lavender accent, never a CTA — the Approval mail
	 * deliberately has no button (a button would suggest an action that does not
	 * exist, mail-auslage-approved.md §3).
	 */
	import type { Snippet } from 'svelte';
	import { ACCENT_LAVENDER, INK_500, INK_700, SURFACE_TINT } from './tokens.js';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div
	style="background:{SURFACE_TINT};border-left:3px solid {ACCENT_LAVENDER};border-radius:10px;padding:14px 16px;margin:0 0 18px;"
>
	<p
		style="margin:0 0 9px 0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:{INK_500};"
	>
		{title}
	</p>
	<p style="margin:0;font-size:14px;line-height:1.5;color:{INK_700};">
		{@render children()}
	</p>
</div>

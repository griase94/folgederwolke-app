<script lang="ts">
	/**
	 * Signoff — divider + "Liebe Grüße, die Finanz-Gschaftler:innen".
	 *
	 * Deliberately hardcoded and deliberately NOT parameterised by Verein name:
	 * the short form is the ratified sign-off of the suite (briefs §6), and the
	 * legal identity is the footer's job. Bavarian "Gschaftler" — never
	 * "Geschäftler"; the brand voice is intentional, so this spelling lives in
	 * exactly one file where it cannot rot back.
	 */
	import { HAIRLINE, INK_500, INK_700 } from './tokens.js';
</script>

<div style="border-top:1px solid {HAIRLINE};margin:8px 0 22px 0;font-size:1px;line-height:1px;">
	&nbsp;
</div>
<p style="margin:0;font-size:13px;color:{INK_500};line-height:1.5;">
	Liebe Grüße,<br /><strong style="color:{INK_700};font-weight:700;"
		>die Finanz-Gschaftler:innen</strong
	>
</p>

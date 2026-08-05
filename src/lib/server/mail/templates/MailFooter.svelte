<script lang="ts">
	/**
	 * Shared, prop-driven legal footer for every mail template.
	 *
	 * Replaces the seven hardcoded "Folge der Wolke e.V. · Westermühlstraße 6,
	 * 80469 München · VR 211227 · Steuernummer 143/215/10028" footers so the
	 * Verein identity is sourced at render time from runtime Stammdaten
	 * (white-label Phase 1, Task 2.1). Mail clients strip CSS variables, so
	 * `brandColor` is a render-time prop with the current FdW default; Phase 2
	 * parameterises it per deployment.
	 *
	 * Inline styles only — mail-client constraint (no external CSS, no <style>).
	 */
	type Props = {
		vereinName: string;
		adresse: string;
		vr: string;
		steuernummer: string;
		brandColor?: string;
	};

	import { BRAND_PRIMARY_STRONG } from '$lib/brand.js';
	import { HAIRLINE, INK_300 } from './kit/tokens.js';
	let { vereinName, adresse, vr, steuernummer, brandColor = BRAND_PRIMARY_STRONG }: Props = $props();
</script>

<!-- Neutrals come from the mail palette, not from Tailwind's cold blue-grays:
     #9ca3af next to Aurora's warm ink read as a different design system in the
     same card (Abnahme "Kit-Fix statt Plate-Pflaster"). Shared by all eight
     templates, so this is one fix, not eight. -->
<tr>
	<td
		style="padding:24px 32px 28px 32px;text-align:center;font-size:11px;color:{INK_300};line-height:1.6;border-top:1px solid {HAIRLINE};"
	>
		<strong style="color:{brandColor};">{vereinName}</strong> · {adresse}<br />
		{vr} · Steuernummer {steuernummer}
	</td>
</tr>

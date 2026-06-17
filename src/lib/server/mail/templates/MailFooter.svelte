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
	let { vereinName, adresse, vr, steuernummer, brandColor = BRAND_PRIMARY_STRONG }: Props = $props();
</script>

<tr>
	<td
		style="padding:24px 32px 28px 32px;text-align:center;font-size:11px;color:#9ca3af;line-height:1.6;border-top:1px solid #f1e6ec;"
	>
		<strong style="color:{brandColor};">{vereinName}</strong> · {adresse}<br />
		{vr} · Steuernummer {steuernummer}
	</td>
</tr>

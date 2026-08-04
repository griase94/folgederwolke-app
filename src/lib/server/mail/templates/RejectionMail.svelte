<script lang="ts">
	/**
	 * RejectionMail — "noch ein kleiner Schritt" (mail-auslage-abgelehnt.md, v1).
	 *
	 * The hardest of the four: it must be unambiguous about the reason and still
	 * feel solvable. Two registers, strictly separated — the frame around the
	 * reason is warm (it lives here), the reason itself is sober (it comes from
	 * the treasurer's Reject-Modal and is rendered verbatim, never reworded,
	 * shortened or decorated).
	 *
	 * Exactly ONE path forward: resubmit. The reply channel is the secondary way
	 * and stays text, not a button.
	 *
	 * A rejected batch element gets this mail alone — the siblings are never
	 * mentioned and never implied to be at risk (auslagen-spec §3.6).
	 */
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { RejectionMailProps } from '../types.js';
	import { BRAND_PRIMARY_STRONG } from '$lib/brand.js';
	import ChipLead from './kit/ChipLead.svelte';
	import DetailCard, { type MailFactRow } from './kit/DetailCard.svelte';
	import GrundBox from './kit/GrundBox.svelte';
	import MailShell from './kit/MailShell.svelte';
	import Signoff from './kit/Signoff.svelte';
	import { datum, eur } from './kit/format.js';
	import { INK_500, INK_700, INK_900 } from './kit/tokens.js';

	let {
		vorname,
		ausId,
		bezeichnung,
		betragCents,
		grund,
		eingereichtAm,
		baseUrl = '',
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = ''
	}: RejectionMailProps & {
		/** Absolute public origin (PUBLIC_BASE_URL), injected by sendMail. */
		baseUrl?: string;
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
	} = $props();

	const rows = $derived<MailFactRow[]>([
		{ label: 'Auslage', value: bezeichnung },
		{ label: 'Betrag', value: eur(betragCents), variant: 'amount' },
		{ label: 'AUS-Nr.', value: ausId, variant: 'mono' },
		...(eingereichtAm
			? [{ label: 'Eingereicht am', value: datum(eingereichtAm), variant: 'num' as const }]
			: [])
	]);

	// Relative paths are dead in mail clients; strip a trailing slash so the
	// origin and the path never produce a double slash.
	const einreichenUrl = $derived(`${baseUrl.replace(/\/+$/, '')}/auslage-einreichen`);
</script>

<MailShell {vereinName} {adresse} {vr} {steuernummer}>
	<ChipLead label="Korrektur nötig" />
	<h1
		style="margin:0 0 14px 0;font-size:22px;font-weight:700;color:{INK_900};letter-spacing:-0.2px;"
	>
		Zu deiner Auslage — noch ein kleiner Schritt
	</h1>

	<p style="margin:0 0 16px 0;color:{INK_700};">
		Liebe:r {vorname}, deine Auslage können wir in dieser Form
		<strong style="color:{INK_900};">noch nicht erstatten</strong>. Kein Drama — wir sagen dir genau,
		woran’s liegt, und dann kriegen wir das zusammen hin.
	</p>

	<DetailCard {rows} />

	<GrundBox title="Woran’s liegt" text={grund} />

	<p style="margin:0 0 16px 0;color:{INK_700};">
		Kein Aufwand: Beleg neu machen, hochladen, fertig. Deine Angaben kannst du dabei direkt
		übernehmen.
	</p>

	<!-- The one CTA. Bulletproof shape: a solid-background <a> block, no gradient
	     and no <button> — mail clients strip both (Abnahme #24). -->
	<div style="margin:0 0 8px 0;">
		<a
			href={einreichenUrl}
			style="display:block;width:100%;box-sizing:border-box;text-align:center;background:{BRAND_PRIMARY_STRONG};color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.01em;padding:15px 24px;border-radius:9px;text-decoration:none;"
			>Auslage neu einreichen</a
		>
	</div>
	<p style="margin:9px 0 20px 0;font-size:12.5px;line-height:1.5;text-align:center;color:{INK_500};">
		Dauert keine zwei Minuten — und dann ist dein Geld auf dem Weg.
	</p>

	<p style="margin:0 0 18px 0;font-size:13.5px;line-height:1.5;color:{INK_500};">
		Fragen dazu? Antworte einfach auf diese E-Mail — wir helfen gern weiter.
	</p>

	<Signoff />
</MailShell>

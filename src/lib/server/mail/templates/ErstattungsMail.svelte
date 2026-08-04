<script lang="ts">
	/**
	 * ErstattungsMail — "deine Erstattung ist raus" (mail-auslage-erstattet.md, v4).
	 *
	 * The payoff of the whole flow and the most playful of the four mails: the
	 * charm in "Vorkasse-Modus aus, Wolken-Modus an" is intentional brand voice,
	 * not filler. The facts around it (date, reference, 1–3 Werktage) stay sober.
	 *
	 * No CTA — the money is already on its way. The Verwendungszweck is the
	 * bridge to the member's bank statement, so it is rendered mono and comes
	 * from the SAME server function the Überweisungs-Werkstatt copies to the
	 * clipboard (erstattungsVerwendungszweck) — two formats would break the
	 * statement lookup this mail promises.
	 */
	import type { ErstattungsMailProps } from '../types.js';
	import ChipLead from './kit/ChipLead.svelte';
	import type { MailFactRow } from './kit/DetailCard.svelte';
	import MailShell from './kit/MailShell.svelte';
	import PaidCard from './kit/PaidCard.svelte';
	import Signoff from './kit/Signoff.svelte';
	import { datum, eur } from './kit/format.js';
	import { INK_700, INK_900 } from './kit/tokens.js';

	let {
		vorname,
		ausId,
		bezeichnung,
		betragCents,
		verwendungszweck,
		erstattungsAm,
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = ''
	}: ErstattungsMailProps & {
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
	} = $props();

	const rows = $derived<MailFactRow[]>([
		{ label: 'Auslage', value: bezeichnung },
		{ label: 'AUS-Nr.', value: ausId, variant: 'mono' },
		{
			label: 'Verwendungszweck',
			value: verwendungszweck,
			variant: 'mono',
			// A reference that wraps mid-AUS-Nr is useless against a bank statement.
			keepTogether: ausId
		}
	]);
</script>

<MailShell {vereinName} {adresse} {vr} {steuernummer}>
	<ChipLead label="Überwiesen" tone="success" />
	<h1
		style="margin:0 0 14px 0;font-size:22px;font-weight:700;color:{INK_900};letter-spacing:-0.2px;"
	>
		Deine Erstattung ist raus
	</h1>

	<p style="margin:0 0 16px 0;color:{INK_700};">
		Liebe:r {vorname}, deine Auslage ist <strong style="color:{INK_900};">erstattet</strong> —
		Vorkasse-Modus aus, Wolken-Modus an.
	</p>

	<PaidCard
		eyebrow="Überwiesen"
		amount={eur(betragCents)}
		sub="Überwiesen am {datum(erstattungsAm)}"
		{rows}
	/>

	<p style="margin:0 0 16px 0;color:{INK_700};">
		Der Betrag sollte in <strong style="color:{INK_900};">1–3 Werktagen</strong> auf deinem Konto
		landen — mit der Referenz oben als Verwendungszweck auf deinem Kontoauszug.
	</p>
	<p style="margin:0 0 18px 0;color:{INK_700};">
		<strong style="color:{INK_900};font-weight:700;">Tausend Dank</strong>, dass du dich für unsere
		Wolke ins Zeug legst.
	</p>

	<Signoff />
</MailShell>

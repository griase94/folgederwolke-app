<script lang="ts">
	/**
	 * ApprovalMail — "deine Auslage ist durch" (mail-auslage-approved.md, v8).
	 *
	 * Good-news mail with no CTA on purpose: there is nothing for the member to
	 * do, and a button would suggest otherwise. The one thing it must land is the
	 * look-ahead — a SECOND mail follows once the money is actually transferred.
	 *
	 * Fires once per Auslage, never as a batch digest: a sibling's rejection must
	 * not cast a shadow on this one (auslagen-spec §3.6).
	 */
	import type { ApprovalMailProps } from '../types.js';
	import AmountHero from './kit/AmountHero.svelte';
	import ChipLead from './kit/ChipLead.svelte';
	import DetailCard, { type MailFactRow } from './kit/DetailCard.svelte';
	import MailShell from './kit/MailShell.svelte';
	import NextStep from './kit/NextStep.svelte';
	import Signoff from './kit/Signoff.svelte';
	import { datum, eur } from './kit/format.js';
	import { INK_500, INK_700, INK_900 } from './kit/tokens.js';

	let {
		vorname,
		ausId,
		bezeichnung,
		betragCents,
		kategorie,
		sphaere,
		decidedAt,
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = ''
	}: ApprovalMailProps & {
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
	} = $props();

	const betrag = $derived(eur(betragCents));
	const rows = $derived<MailFactRow[]>([
		{ label: 'AUS-Nr.', value: ausId, variant: 'mono' },
		{ label: 'Kategorie', value: sphaere ? `${kategorie} · ${sphaere}` : kategorie },
		{ label: 'Genehmigt am', value: datum(decidedAt), variant: 'num' }
	]);
</script>

<MailShell {vereinName} {adresse} {vr} {steuernummer}>
	<ChipLead label="Genehmigt" tone="success" />
	<h1
		style="margin:0 0 14px 0;font-size:22px;font-weight:700;color:{INK_900};letter-spacing:-0.2px;"
	>
		Deine Auslage ist durch
	</h1>

	<p style="margin:0 0 16px 0;color:{INK_700};">
		Liebe:r {vorname}, gute Neuigkeit: Deine Auslage über
		<strong style="color:{INK_900};">{betrag}</strong> ist geprüft und
		<strong style="color:{INK_900};">freigegeben</strong>.
	</p>

	<AmountHero eyebrow="Genehmigter Betrag" amount={betrag} meta={bezeichnung} accent="emerald" />

	<DetailCard {rows} />

	<NextStep title="Wie es weitergeht">
		Du bekommst von uns nochmal eine E-Mail, sobald die Erstattung
		<strong style="color:{INK_900};font-weight:700;">überwiesen</strong> ist — dann ist das Geld auf
		dem Weg zu dir.
	</NextStep>

	<p style="margin:0 0 18px 0;font-size:13.5px;line-height:1.5;color:{INK_500};">
		Stimmt etwas nicht? Antworte einfach auf diese E-Mail, dann schauen wir uns das gemeinsam an.
	</p>

	<Signoff />
</MailShell>

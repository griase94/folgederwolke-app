<script lang="ts">
	/**
	 * EingangsMail — "deine Auslage ist da" (mail-auslage-eingang.md).
	 *
	 * Answers three questions without scrolling: angekommen? wie viel? was
	 * passiert jetzt? The three-step block is the load-bearing part — it is what
	 * stops people from wondering a week later whether anything is happening.
	 *
	 * Batch: ONE digest for the whole submission (deduped on the group id,
	 * ADR-0005) with every Auslage under its OWN number. The decision mails stay
	 * per Auslage — only the arrival is bundled.
	 */
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { EingangsMailProps } from '../types.js';
	import { BRAND_PRIMARY_STRONG } from '$lib/brand.js';
	import AmountHero from './kit/AmountHero.svelte';
	import ChipLead from './kit/ChipLead.svelte';
	import DetailCard, { type MailFactRow } from './kit/DetailCard.svelte';
	import MailShell from './kit/MailShell.svelte';
	import NextStep from './kit/NextStep.svelte';
	import Signoff from './kit/Signoff.svelte';
	import { datum, eur } from './kit/format.js';
	import {
		HAIRLINE,
		INK_500,
		INK_700,
		INK_900,
		MONO_STACK,
		PLUM,
		SURFACE_PLAIN
	} from './kit/tokens.js';

	let {
		vorname,
		ausId,
		bezeichnung,
		betragCents,
		rechnungsdatum = null,
		eingereichtAm,
		items = undefined,
		baseUrl = '',
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = ''
	}: EingangsMailProps & {
		/** Absolute public origin (PUBLIC_BASE_URL), injected by sendMail. */
		baseUrl?: string;
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
	} = $props();

	const isBatch = $derived(Array.isArray(items) && items.length > 1);
	const count = $derived(items?.length ?? 1);
	const betragFmt = $derived(eur(betragCents));

	const rows = $derived<MailFactRow[]>([
		{ label: 'AUS-Nr.', value: ausId, variant: 'mono' },
		...(rechnungsdatum
			? [{ label: 'Rechnungsdatum', value: datum(rechnungsdatum), variant: 'num' as const }]
			: []),
		{ label: 'Eingegangen am', value: datum(eingereichtAm), variant: 'num' }
	]);

	// Token-free status link. In a batch ANY number opens the whole group, so the
	// first one is as good as a group id — and one less thing to keep track of.
	const statusUrl = $derived(`${baseUrl.replace(/\/+$/, '')}/auslage-status/${ausId}`);
</script>

<MailShell {vereinName} {adresse} {vr} {steuernummer}>
	<ChipLead label={isBatch ? `${count} Auslagen eingegangen` : 'Eingegangen'} />
	<h1
		style="margin:0 0 14px 0;font-size:22px;font-weight:700;color:{INK_900};letter-spacing:-0.2px;"
	>
		{isBatch
			? `Alles drin, ${vorname} — ${count} Auslagen unterwegs`
			: 'Deine Auslage ist bei uns gelandet'}
	</h1>

	{#if isBatch}
		<p style="margin:0 0 16px 0;color:{INK_700};">
			Liebe:r {vorname}, tausend Dank, dass du für unsere Wolke in Vorkasse gegangen bist. Alle
			{count} Auslagen sind da — <strong style="color:{INK_900};">jede mit eigener Nummer</strong>
			und eigenem Status.
		</p>

		<table
			role="presentation"
			cellspacing="0"
			cellpadding="0"
			border="0"
			width="100%"
			lang="de"
			style="width:100%;background:{SURFACE_PLAIN};border:1px solid {HAIRLINE};border-radius:12px;border-collapse:separate;border-spacing:0;margin:0 0 8px;"
		>
			<tbody>
				{#each items ?? [] as item (item.ausId)}
					<tr>
						<td style="padding:12px 16px;border-bottom:1px solid {HAIRLINE};vertical-align:middle;">
							<span
								style="display:block;font-family:{MONO_STACK};font-size:11px;letter-spacing:0.2px;color:{INK_500};margin-bottom:2px;"
								>{item.ausId}</span
							>
							<span style="font-size:13.5px;font-weight:600;line-height:1.4;color:{INK_900};"
								>{item.bezeichnung}</span
							>
						</td>
						<td
							style="padding:12px 16px;border-bottom:1px solid {HAIRLINE};text-align:right;white-space:nowrap;vertical-align:middle;font-size:14px;font-weight:700;color:{PLUM};font-variant-numeric:tabular-nums;"
							>{eur(item.betragCents)}</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
		<table
			role="presentation"
			cellspacing="0"
			cellpadding="0"
			border="0"
			width="100%"
			style="width:100%;border-collapse:collapse;margin:0 0 18px;"
		>
			<tbody>
				<tr>
					<td
						style="padding:11px 16px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:{INK_500};"
						>Gesamt · {count} Auslagen</td
					>
					<td
						style="padding:11px 16px;text-align:right;font-size:19px;font-weight:800;color:{PLUM};letter-spacing:-0.01em;font-variant-numeric:tabular-nums;"
						>{betragFmt}</td
					>
				</tr>
			</tbody>
		</table>

		<NextStep title="Was jetzt passiert">
			Wir prüfen <strong style="color:{INK_900};font-weight:700;">jede Auslage einzeln</strong> — zu
			jeder Entscheidung bekommst du eine eigene E-Mail. In der Regel ist das Geld innerhalb von 1–2
			Wochen zurück bei dir.
		</NextStep>
	{:else}
		<p style="margin:0 0 16px 0;color:{INK_700};">
			Liebe:r {vorname}, tausend Dank, dass du für unsere Wolke in Vorkasse gegangen bist. Deine
			Auslage ist da — <strong style="color:{INK_900};">du musst jetzt nichts weiter tun</strong>.
		</p>

		<AmountHero eyebrow="Eingereichte Auslage" amount={betragFmt} meta={bezeichnung} />

		<DetailCard {rows} />

		<NextStep title="Was jetzt passiert">
			<strong style="color:{INK_900};font-weight:700;">Eingereicht ✓</strong> — alles da, Beleg ist
			bei uns.<br />
			<strong style="color:{INK_900};font-weight:700;">Wir schauen drüber</strong> — meistens
			innerhalb weniger Tage.<br />
			<strong style="color:{INK_900};font-weight:700;">Geld kommt zurück</strong> — in der Regel innerhalb
			von 1–2 Wochen.
		</NextStep>
	{/if}

	<!-- The one CTA. Solid fill, no gradient — mail clients strip those. -->
	<div style="margin:0 0 8px 0;">
		<a
			href={statusUrl}
			style="display:block;width:100%;box-sizing:border-box;text-align:center;background:{BRAND_PRIMARY_STRONG};color:#ffffff;font-size:16px;font-weight:700;letter-spacing:0.01em;padding:15px 24px;border-radius:9px;text-decoration:none;"
			>{isBatch ? 'Alle Status ansehen' : 'Auslage-Status ansehen'}</a
		>
	</div>
	<p style="margin:9px 0 20px 0;font-size:12.5px;line-height:1.5;text-align:center;color:{INK_500};">
		{isBatch
			? 'Jede deiner Nummern öffnet die ganze Gruppe — Hauptsache, du hast eine parat. Ganz ohne Login.'
			: 'Jederzeit nachschauen, wo deine Erstattung gerade steht — ganz ohne Login.'}
	</p>

	<!-- The `{#if}` boundary eats the whitespace around it, so the space before
	     "Passt" is written as an entity — otherwise the two sentences collide. -->
	<p style="margin:0 0 18px 0;font-size:13.5px;line-height:1.5;color:{INK_500};">
		{#if !isBatch}Halte deine Nummer <strong style="color:{INK_700};font-weight:600;">{ausId}</strong
			> bereit.&nbsp;{/if}Passt was nicht? Antworte einfach auf diese E-Mail.
	</p>

	<Signoff />
</MailShell>

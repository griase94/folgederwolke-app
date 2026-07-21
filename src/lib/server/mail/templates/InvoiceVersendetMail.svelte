<script lang="ts">
	import type { InvoiceVersendetMailProps } from '../types.js';
	import { BRAND_PRIMARY_STRONG } from '$lib/brand.js';
	import MailFooter from './MailFooter.svelte';

	// customerName stays on the props contract but the greeting renders `anrede`
	// (never "Liebe:r {Firmenname}"), so it's intentionally not destructured here.
	let {
		anrede,
		invoiceNumber,
		bezeichnung,
		bruttoCents,
		currency,
		rechnungsdatum,
		faelligkeitsDatum,
		iban,
		bic,
		empfaenger,
		qrPngCid,
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = ''
	}: InvoiceVersendetMailProps & {
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
	} = $props();

	const bruttoFmt = $derived(
		(bruttoCents / 100).toLocaleString('de-DE', { style: 'currency', currency })
	);

	function fmtDate(iso: string | null): string {
		if (!iso) return '';
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
		return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
	}

	const datumFmt = $derived(fmtDate(rechnungsdatum));
	const faelligFmt = $derived(faelligkeitsDatum ? fmtDate(faelligkeitsDatum) : null);

	// IBAN in human-readable 4-char groups (DE21 7015 0000 0012 3456 78) —
	// strip any existing spaces first so a pre-grouped or raw IBAN both work.
	function formatIban(raw: string | undefined): string {
		if (!raw) return '';
		return raw.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
	}
	const ibanFmt = $derived(formatIban(iban));

	// Personalised greeting: verbatim customers.anrede ("Liebe Maria") when set,
	// neutral "Hallo!" otherwise. We NEVER synthesise "Liebe:r {Firmenname}"
	// (mail-invoice.md §1.3) — customerName is kept only for the props contract.
	const hasAnrede = $derived(typeof anrede === 'string' && anrede.trim().length > 0);

	// Bank-transfer block gate: the full EPC-069 table needs iban + bic +
	// empfaenger + EUR. Any deployment missing one falls back to the plain
	// Überweisung hint so the mail is still a valid, sendable email.
	const showBankBlock = $derived(Boolean(iban && bic && empfaenger && currency === 'EUR'));
</script>

<!--
  "Rechnung versendet" customer email (E-PR3 Versand-Pfad). The canonical PDF
  rides along as a provider-layer attachment — there is NO download CTA and NO
  /app/* link in the customer-facing mail. The Giro-QR *image* is deferred to
  the QR-lib PR; today we render the plate's no-image payment state (bank table
  + Überweisung hint). Table-based, inline styles, solid hex only (mail-safe).
-->
<table
	role="presentation"
	cellspacing="0"
	cellpadding="0"
	border="0"
	width="100%"
	style="background:#f8f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"
>
	<tbody>
		<tr>
			<td align="center" style="padding:40px 16px;">
				<table
					role="presentation"
					cellspacing="0"
					cellpadding="0"
					border="0"
					width="560"
					style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #ece7f2;"
				>
					<tbody>
						<!-- 1. Brand strip -->
						<tr>
							<td
								style="background:{BRAND_PRIMARY_STRONG};padding:18px 32px;border-radius:16px 16px 0 0;"
							>
								<p
									style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;"
								>
									{vereinName}
								</p>
							</td>
						</tr>

						<!-- Body -->
						<tr>
							<td style="padding:36px 32px 8px 32px;line-height:1.55;font-size:15px;color:#3a3050;">
								<!-- 2. H1 -->
								<h1
									style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#1a1126;letter-spacing:-0.2px;"
								>
									Rechnung {invoiceNumber}
								</h1>

				<!-- 3. Greeting + one-sentence intro. The anrede is verbatim from the
				     Kunde, which may be formal Sie ("Sehr geehrte Damen und Herren") —
				     so the shared intro stays register-neutral ("die Rechnung", not
				     "deine"). Only the "Hallo!" fallback (our own voice) keeps du-form. -->
								<p style="margin:0 0 20px 0;color:#3a3050;">{#if hasAnrede}{anrede}, anbei die Rechnung als PDF — hier die Eckdaten auf einen Blick:{:else}Hallo! Anbei deine Rechnung als PDF — hier die Eckdaten auf einen Blick:{/if}</p>

								<!-- 4. Detail card -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="background:#f4eefb;border-radius:12px;margin:0 0 12px 0;"
								>
									<tbody>
										<tr>
											<td style="padding:16px 20px;">
												<table
													role="presentation"
													cellspacing="0"
													cellpadding="0"
													border="0"
													width="100%"
													style="font-size:13px;color:#3a3050;"
												>
													<tbody>
														<tr>
															<td
																style="padding:6px 0;color:#6d6481;white-space:nowrap;vertical-align:top;"
																>Rechnungs-Nr.</td
															>
															<td
																style="padding:6px 0;color:#1a1126;text-align:right;vertical-align:top;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-weight:700;font-variant-numeric:tabular-nums;"
																>{invoiceNumber}</td
															>
														</tr>
														<tr>
															<td
																style="padding:6px 0;color:#6d6481;white-space:nowrap;vertical-align:top;"
																>Bezeichnung</td
															>
															<td
																style="padding:6px 0;color:#1a1126;text-align:right;vertical-align:top;"
																>{bezeichnung}</td
															>
														</tr>
														<!-- LOUD row: pure ink, never pink, never money-color -->
														<tr>
															<td
																style="padding:11px 0 6px 0;color:#3a3050;font-weight:600;white-space:nowrap;vertical-align:top;border-top:1px solid #e4d9f0;"
																>Rechnungsbetrag</td
															>
															<td
																style="padding:11px 0 6px 0;color:#1a1126;font-size:19px;font-weight:800;letter-spacing:-0.01em;text-align:right;vertical-align:top;font-variant-numeric:tabular-nums;border-top:1px solid #e4d9f0;"
																>{bruttoFmt}</td
															>
														</tr>
														<tr>
															<td
																style="padding:6px 0;color:#6d6481;white-space:nowrap;vertical-align:top;"
																>Rechnungsdatum</td
															>
															<td
																style="padding:6px 0;color:#1a1126;text-align:right;vertical-align:top;font-variant-numeric:tabular-nums;"
																>{datumFmt}</td
															>
														</tr>
														{#if faelligFmt}
															<tr>
																<td
																	style="padding:6px 0;color:#6d6481;white-space:nowrap;vertical-align:top;"
																	>Fällig bis</td
																>
																<td
																	style="padding:6px 0;color:#1a1126;text-align:right;vertical-align:top;font-variant-numeric:tabular-nums;"
																	>{faelligFmt}</td
																>
															</tr>
														{/if}
													</tbody>
												</table>
											</td>
										</tr>
									</tbody>
								</table>

								<!-- 5. §19 UStG note -->
								<p style="margin:0 0 22px 0;font-size:13px;color:#6d6481;line-height:1.5;">
									Rechnungsbetrag brutto = netto · kein Umsatzsteuer-Ausweis (Kleinunternehmer nach
									§ 19 UStG).
								</p>

								<!-- 6. PDF attachment notice (NOT a download button — the PDF is attached) -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="margin:0 0 22px 0;border:1px solid #ece7f2;border-radius:10px;"
								>
									<tbody>
										<tr>
											<td style="padding:12px 16px;">
												<p style="margin:0 0 4px 0;font-size:14px;font-weight:600;color:#1a1126;">
													Deine Rechnung hängt als PDF an dieser E-Mail.
												</p>
												<p
													style="margin:0;font-size:13px;color:#6d6481;font-family:'SFMono-Regular',Menlo,Consolas,monospace;"
												>
													{invoiceNumber}.pdf
												</p>
											</td>
										</tr>
									</tbody>
								</table>

								<!-- 7. Payment block -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="background:#f4eefb;border-radius:12px;margin:0 0 22px 0;"
								>
									<tbody>
										<tr>
											<td style="padding:18px 20px;">
												<p
													style="margin:0 0 12px 0;font-size:11px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#6d6481;"
												>
													So kannst du bezahlen
												</p>
												<!--
												  Giro-QR image intentionally DEFERRED to the QR-lib PR. When that
												  lands, the server-rendered EPC-069 SEPA-QR <img> slots in HERE —
												  directly above the bank-transfer table, behind the same
												  iban && bic && empfaenger && EUR gate (showBankBlock).
												-->
												{#if showBankBlock}
													<table
														role="presentation"
														cellspacing="0"
														cellpadding="0"
														border="0"
														width="100%"
														style="font-size:13px;color:#3a3050;margin:0 0 12px 0;"
													>
														<tbody>
															<tr>
																<td
																	style="padding:5px 0;color:#6d6481;white-space:nowrap;vertical-align:top;"
																	>Empfänger</td
																>
																<td
																	style="padding:5px 0;color:#1a1126;text-align:right;vertical-align:top;"
																	>{empfaenger}</td
																>
															</tr>
															<tr>
																<td
																	style="padding:5px 0;color:#6d6481;white-space:nowrap;vertical-align:top;"
																	>IBAN</td
																>
																<td
																	style="padding:5px 0;color:#1a1126;text-align:right;vertical-align:top;font-family:'SFMono-Regular',Menlo,Consolas,monospace;white-space:nowrap;font-variant-numeric:tabular-nums;"
																	>{ibanFmt}</td
																>
															</tr>
															<tr>
																<td
																	style="padding:5px 0;color:#6d6481;white-space:nowrap;vertical-align:top;"
																	>BIC</td
																>
																<td
																	style="padding:5px 0;color:#1a1126;text-align:right;vertical-align:top;font-family:'SFMono-Regular',Menlo,Consolas,monospace;"
																	>{bic}</td
																>
															</tr>
															<tr>
																<td
																	style="padding:5px 0;color:#6d6481;white-space:nowrap;vertical-align:top;"
																	>Verwendungszweck</td
																>
																<td
																	style="padding:5px 0;color:#1a1126;text-align:right;vertical-align:top;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-weight:700;"
																	>{invoiceNumber}</td
																>
															</tr>
															<tr>
																<td
																	style="padding:5px 0;color:#6d6481;white-space:nowrap;vertical-align:top;"
																	>Betrag</td
																>
																<td
																	style="padding:5px 0;color:#1a1126;text-align:right;vertical-align:top;font-weight:700;font-variant-numeric:tabular-nums;"
																	>{bruttoFmt}</td
																>
															</tr>
														</tbody>
													</table>
												{/if}
												{#if qrPngCid}
													<!-- Giro-Code: server-rendered EPC-069 SEPA-QR as a CID inline
													     image (never a data-URI). alt carries the payload essentials
													     so a client that blocks images still shows Betrag + Zweck. -->
													<div style="border-top:1px solid #e4d9f0;margin:14px 0 0 0;font-size:1px;line-height:1px;">&nbsp;</div>
													<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:14px 0 0 0;">
														<tbody>
															<tr>
																<td style="vertical-align:top;padding-right:18px;">
																	<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #ece7f2;border-radius:10px;background:#ffffff;">
																		<tbody>
																			<tr>
																				<td style="padding:7px;text-align:center;line-height:0;">
																					<img
																						src="cid:{qrPngCid}"
																						width="102"
																						height="102"
																						alt="Giro-Code — SEPA-Überweisung, Betrag {bruttoFmt}, Verwendungszweck {invoiceNumber}"
																						style="display:block;width:102px;height:102px;border:0;"
																					/>
																				</td>
																			</tr>
																		</tbody>
																	</table>
																</td>
																<td style="vertical-align:top;">
																	<p style="margin:0 0 4px 0;font-size:11px;font-weight:800;letter-spacing:0.6px;text-transform:uppercase;color:#7c3aed;">Giro-Code</p>
																	<p style="margin:0;font-size:13px;color:#3a3050;line-height:1.5;">QR mit der Banking-App scannen — Betrag und Verwendungszweck sind schon drin.</p>
																</td>
															</tr>
														</tbody>
													</table>
												{:else}
													<p style="margin:0;font-size:13px;color:#3a3050;line-height:1.5;">{#if showBankBlock}Einfach per Überweisung mit dem Verwendungszweck oben — so ordnen wir deine Zahlung sofort zu.{:else}Bitte per Überweisung mit dem Verwendungszweck {invoiceNumber} — so ordnen wir deine Zahlung sofort zu.{/if}</p>
												{/if}
											</td>
										</tr>
									</tbody>
								</table>

								<!-- 8. Closing -->
								<p style="margin:0 0 24px 0;color:#3a3050;">
									Bei Fragen zur Rechnung antworte einfach auf diese E-Mail — wir helfen gern
									weiter.
								</p>

								<!-- 9. Divider + sign-off -->
								<div
									style="border-top:1px solid #ece7f2;margin:8px 0 22px 0;font-size:1px;line-height:1px;"
								>
									&nbsp;
								</div>

								<p style="margin:0;font-size:13px;color:#6d6481;line-height:1.5;">
									Mit herzlichen Grüßen<br /><strong style="color:#3a3050">{vereinName}</strong>
								</p>
							</td>
						</tr>

						<!-- 10. Footer -->
						<MailFooter {vereinName} {adresse} {vr} {steuernummer} />
					</tbody>
				</table>
			</td>
		</tr>
	</tbody>
</table>

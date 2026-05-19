<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { InvoiceVersendetMailProps } from '../types.js';
	import { buildEpc069Payload } from '../giro-qr.js';

	let {
		customerName,
		invoiceNumber,
		bezeichnung,
		bruttoCents,
		currency,
		rechnungsdatum,
		faelligkeitsDatum,
		downloadUrl,
		iban,
		bic,
		empfaenger
	}: InvoiceVersendetMailProps = $props();

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

	// EPC 069 SEPA Giro-QR payload — only rendered when both `iban` and
	// `empfaenger` are present and currency is EUR. Callers without these
	// fields keep the existing behaviour (PM-024 deferred PNG rendering).
	const showGiroQr = $derived(Boolean(iban && empfaenger && currency === 'EUR'));
	const epcPayload = $derived(
		showGiroQr
			? buildEpc069Payload({
					bic,
					name: empfaenger as string,
					iban: iban as string,
					amountCents: bruttoCents,
					remittance: invoiceNumber
				})
			: ''
	);
</script>

<!--
  Invoice-versendet email (B2B tone, more formal than the Auslagen mails).
  Brand-strip pattern matches MagicLink.svelte (UI-031, 2026-05-19, section 3.13).
  Embeds an EPC 069 Giro-QR text payload when iban + empfaenger are
  provided (PM-024).
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
					style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #f1e6ec;"
				>
					<tbody>
						<!-- Brand strip -->
						<tr>
							<td style="background:#be185d;padding:18px 32px;border-radius:16px 16px 0 0;">
								<p
									style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;"
								>
									Folge der Wolke
								</p>
							</td>
						</tr>

						<!-- Body -->
						<tr>
							<td style="padding:36px 32px 8px 32px;line-height:1.55;font-size:15px;color:#1f2937;">
								<h1
									style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.2px;"
								>
									Rechnung {invoiceNumber}
								</h1>

								<p style="margin:0 0 16px 0;color:#374151;">
									Liebe:r <strong>{customerName}</strong>, anbei senden wir die Rechnung im Anhang.
									Hier die wichtigsten Eckdaten auf einen Blick:
								</p>

								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="background:#fdf2f8;border-radius:12px;margin:0 0 22px 0;"
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
													style="font-size:13px;color:#374151;"
												>
													<tbody>
														<tr>
															<td
																style="padding:5px 0;color:#6b7280;width:140px;white-space:nowrap;vertical-align:top;"
																>Rechnungs-Nr.</td
															>
															<td style="padding:5px 0;color:#111827;font-weight:700;"
																>{invoiceNumber}</td
															>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6b7280;white-space:nowrap;vertical-align:top;"
																>Bezeichnung</td
															>
															<td style="padding:5px 0;color:#111827;">{bezeichnung}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6b7280;white-space:nowrap;vertical-align:top;"
																>Betrag</td
															>
															<td style="padding:5px 0;color:#111827;font-weight:600;">{bruttoFmt}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6b7280;white-space:nowrap;vertical-align:top;"
																>Rechnungsdatum</td
															>
															<td style="padding:5px 0;color:#111827;">{datumFmt}</td>
														</tr>
														{#if faelligFmt}
															<tr>
																<td
																	style="padding:5px 0;color:#6b7280;white-space:nowrap;vertical-align:top;"
																	>Fällig bis</td
																>
																<td style="padding:5px 0;color:#111827;">{faelligFmt}</td>
															</tr>
														{/if}
													</tbody>
												</table>
											</td>
										</tr>
									</tbody>
								</table>

								{#if downloadUrl}
									<!-- CTA Button -->
									<table
										role="presentation"
										cellspacing="0"
										cellpadding="0"
										border="0"
										width="100%"
										style="margin:0 0 22px 0;"
									>
										<tbody>
											<tr>
												<td align="center">
													<a
														href={downloadUrl}
														style="display:inline-block;padding:14px 32px;background:#be185d;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;"
													>
														Rechnung herunterladen
													</a>
												</td>
											</tr>
										</tbody>
									</table>
								{/if}

								{#if showGiroQr}
									<!-- EPC 069 Giro-QR payload (PM-024) -->
									<p style="margin:0 0 8px 0;font-size:13px;color:#374151;">
										<strong>SEPA-QR (Giro-Code):</strong> Banking-Apps scannen den Text aus dem
										QR-Code, sodass IBAN, Betrag und Verwendungszweck automatisch ausgefüllt sind.
										Solange wir ihn noch nicht als Bild rendern, kannst du den Payload kopieren oder
										über einen QR-Generator deiner Wahl scannen.
									</p>
									<pre
										style="margin:0 0 22px 0;padding:14px 18px;background:#f9fafb;border:1px solid #f1e6ec;border-radius:10px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:12px;color:#1f2937;white-space:pre;overflow-x:auto;">{epcPayload}</pre>
								{/if}

								<p style="margin:0 0 24px 0;color:#374151;">
									Bei Rückfragen zur Rechnung melde dich gerne jederzeit.
								</p>

								<!-- Divider -->
								<div
									style="border-top:1px solid #f1e6ec;margin:8px 0 22px 0;font-size:1px;line-height:1px;"
								>
									&nbsp;
								</div>

								<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
									Mit herzlichen Grüßen,<br /><strong style="color:#374151;"
										>Folge der Wolke e.V.</strong
									>
								</p>
							</td>
						</tr>

						<!-- Footer -->
						<tr>
							<td
								style="padding:24px 32px 28px 32px;text-align:center;font-size:11px;color:#9ca3af;line-height:1.6;border-top:1px solid #f1e6ec;"
							>
								<strong style="color:#6b7280;">Folge der Wolke e.V.</strong> · Westermühlstraße 6,
								80469 München<br />
								VR 211227 · Steuernummer 143/215/10028
							</td>
						</tr>
					</tbody>
				</table>
			</td>
		</tr>
	</tbody>
</table>

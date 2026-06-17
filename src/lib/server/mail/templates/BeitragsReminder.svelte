<script lang="ts">
	import type { BeitragsReminderProps } from '../types.js';
	import { buildEpc069Payload } from '../giro-qr.js';
	import MailFooter from './MailFooter.svelte';

	let {
		vorname,
		nachname,
		jahr,
		betragCents,
		iban,
		bic,
		bank,
		empfaenger,
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = ''
	}: BeitragsReminderProps & {
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
	} = $props();

	const betragFmt = $derived(
		(betragCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
	);

	// Format IBAN in 4-char groups: DE43830654089999999999 → DE43 8306 5408 9999 9999 99
	const ibanReadable = $derived(
		iban
			.replace(/\s+/g, '')
			.toUpperCase()
			.replace(/(.{4})/g, '$1 ')
			.trim()
	);

	const fullName = $derived(nachname ? `${vorname} ${nachname}`.trim() : vorname);
	const verwendungszweck = $derived(`Mitgliedsbeitrag ${jahr} ${fullName}`);

	// EPC 069 SEPA Giro-QR payload — banking apps scan this to pre-fill the
	// Überweisung. Rendered as a <pre> block until a QR-encoding lib is
	// approved (PM-024, 2026-05-19).
	const epcPayload = $derived(
		buildEpc069Payload({
			bic,
			name: empfaenger,
			iban,
			amountCents: betragCents,
			remittance: verwendungszweck
		})
	);
	import { BRAND_PRIMARY_STRONG } from '$lib/brand.js';
</script>

<!--
  Beitrags-Reminder email.
  Brand-strip pattern matches MagicLink.svelte (UI-031, 2026-05-19 §3.13).
  Embeds an EPC 069 SEPA Giro-QR payload as text (PM-024) — once a
  QR-encoding library is approved, swap the <pre> for an inline <img>.
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
							<td style="background:{BRAND_PRIMARY_STRONG};padding:18px 32px;border-radius:16px 16px 0 0;">
								<p
									style="margin:0;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;"
								>
									{vereinName}
								</p>
							</td>
						</tr>

						<!-- Body -->
						<tr>
							<td style="padding:36px 32px 8px 32px;line-height:1.55;font-size:15px;color:#1f2937;">
								<h1
									style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.2px;"
								>
									Dein Vereinsbeitrag {jahr}
								</h1>

								<p style="margin:0 0 18px 0;color:#374151;">
									<strong>Liebste:r {vorname},</strong> kleine sonnige Erinnerung — dein
									Mitgliedsbeitrag für <strong>{jahr}</strong> ist noch offen.
								</p>

								<!-- Payment card (monospace, copy-friendly per UI-031) -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="background:#f9fafb;border:1px solid #f1e6ec;border-radius:12px;margin:0 0 14px 0;"
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
																style="padding:5px 0;color:#6b7280;width:170px;white-space:nowrap;vertical-align:top;"
																>Empfänger</td
															>
															<td style="padding:5px 0;color:#111827;font-weight:600;"
																>{empfaenger}</td
															>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6b7280;white-space:nowrap;vertical-align:top;"
																>IBAN</td
															>
															<td
																style="padding:5px 0;color:#111827;font-family:'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:0.3px;"
																>{ibanReadable}</td
															>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6b7280;white-space:nowrap;vertical-align:top;"
																>BIC</td
															>
															<td style="padding:5px 0;color:#111827;">
																<span
																	style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;"
																	>{bic}</span
																>
																<span style="color:#6b7280;"> ({bank})</span>
															</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6b7280;white-space:nowrap;vertical-align:top;"
																>Betrag</td
															>
															<td style="padding:5px 0;color:#111827;font-weight:700;">{betragFmt}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6b7280;white-space:nowrap;vertical-align:top;"
																>Verwendungszweck</td
															>
															<td
																style="padding:5px 0;color:#111827;font-weight:600;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:12px;"
																>{verwendungszweck}</td
															>
														</tr>
													</tbody>
												</table>
											</td>
										</tr>
									</tbody>
								</table>

								<p style="margin:0 0 18px 0;font-size:12px;color:#6b7280;font-style:italic;">
									Bitte den Verwendungszweck genau so übernehmen — sonst können wir die Zahlung
									nicht zuordnen.
								</p>

								<!-- EPC 069 Giro-QR payload (PM-024) -->
								<p style="margin:0 0 8px 0;font-size:13px;color:#374151;">
									<strong>SEPA-QR (Giro-Code):</strong> Banking-Apps scannen den Text direkt aus dem
									QR-Code. Solange wir ihn noch nicht als Bild rendern, kannst du den Payload kopieren
									oder über einen QR-Generator deiner Wahl scannen.
								</p>
								<pre
									style="margin:0 0 22px 0;padding:14px 18px;background:#f9fafb;border:1px solid #f1e6ec;border-radius:10px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:12px;color:#1f2937;white-space:pre;overflow-x:auto;">{epcPayload}</pre>

								<p style="margin:0 0 18px 0;color:#374151;">
									Mit deinem Beitrag finanzieren wir unser {vereinName} Wochenende, faire
									Künstler:innen-Honorare und alles, was unsere Wolke sonst noch so trägt.
								</p>
								<p style="margin:0 0 24px 0;color:#374151;">
									Falls Geld dieses Jahr knapp ist: meld dich bei uns — wir können den Beitrag
									aussetzen oder reduzieren. Niemand fliegt deshalb raus.
								</p>

								<!-- Divider -->
								<div
									style="border-top:1px solid #f1e6ec;margin:8px 0 22px 0;font-size:1px;line-height:1px;"
								>
									&nbsp;
								</div>

								<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
									Mit besten Grüßen,<br /><strong style="color:#374151;"
										>deine {vereinName} Finanz-Geschäftler:innen</strong
									>
								</p>
							</td>
						</tr>

						<!-- Footer -->
						<MailFooter {vereinName} {adresse} {vr} {steuernummer} />
					</tbody>
				</table>
			</td>
		</tr>
	</tbody>
</table>

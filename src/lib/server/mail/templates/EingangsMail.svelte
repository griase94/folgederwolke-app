<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { EingangsMailProps } from '../types.js';
	import MailFooter from './MailFooter.svelte';

	let {
		vorname,
		ausId,
		bezeichnung,
		betragCents,
		eingereichtAm,
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = ''
	}: EingangsMailProps & {
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
	} = $props();

	const betragFmt = $derived(
		(betragCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
	);
	const datumFmt = $derived(
		eingereichtAm.toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		})
	);
	const statusUrl = $derived(`/auslage-status/${ausId}`);
</script>

<!--
  Auslage-Eingang confirmation email.
  Brand-strip pattern matches MagicLink.svelte (UI-031, 2026-05-19 §3.13).
  All colors are solid hex — Gmail/Outlook strip oklch() + linear-gradient().
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
									Auslage eingegangen
								</h1>

								<p style="margin:0 0 16px 0;color:#374151;">
									<strong>Liebste:r {vorname},</strong> Hallo und vielen lieben Dank, dass du für
									unsere Wolke in Vorkasse gegangen bist.
								</p>

								<!-- Detail card -->
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
																>AUS-ID</td
															>
															<td style="padding:5px 0;color:#111827;font-weight:700;">{ausId}</td>
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
															<td style="padding:5px 0;color:#111827;font-weight:600;">{betragFmt}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6b7280;white-space:nowrap;vertical-align:top;"
																>Eingereicht am</td
															>
															<td style="padding:5px 0;color:#111827;">{datumFmt}</td>
														</tr>
													</tbody>
												</table>
											</td>
										</tr>
									</tbody>
								</table>

								<p style="margin:0 0 18px 0;color:#374151;">
									<strong>Was jetzt passiert:</strong> Wir prüfen die Unterlagen und überweisen dir
									das Geld in der Regel innerhalb von 1–2 Wochen. Du bekommst nochmal eine Mail von
									uns, sobald es raus ist.
								</p>

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
													href={statusUrl}
													style="display:inline-block;padding:14px 32px;background:#be185d;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;"
												>
													Auslage-Status ansehen
												</a>
											</td>
										</tr>
									</tbody>
								</table>

								<p style="margin:0 0 24px 0;font-size:13px;color:#6b7280;line-height:1.55;">
									Eine kleine Erinnerung von den Finanz-Geschäftler:innen — falls dir etwas auffällt,
									melde dich einfach.
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

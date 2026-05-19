<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { EingangsMailProps } from '../types.js';

	let { vorname, ausId, bezeichnung, betragCents, eingereichtAm }: EingangsMailProps = $props();

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

<table
	role="presentation"
	cellspacing="0"
	cellpadding="0"
	border="0"
	width="100%"
	style="background:#FCE7F3;"
>
	<tbody>
		<tr>
			<td align="center" style="padding:30px 16px;">
				<table
					role="presentation"
					cellspacing="0"
					cellpadding="0"
					border="0"
					width="600"
					style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;"
				>
					<tbody>
						<!-- Header -->
						<tr>
							<td
								style="background:#be185d;padding:30px 40px;"
							>
								<p
									style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;"
								>
									Folge der Wolke e.V.
								</p>
								<p style="margin:4px 0 0 0;color:#FBCFE8;font-size:13px;">
									Ein Liebesbrief von den Finanz-Geschäftler:innen
								</p>
							</td>
						</tr>

						<!-- Body -->
						<tr>
							<td style="padding:36px 40px;line-height:1.6;font-size:14px;">
								<p style="margin:0 0 14px 0;font-size:16px;color:#be185d;">
									<strong>Liebste:r {vorname},</strong>
								</p>
								<p style="margin:0 0 16px 0;">
									Hallo und vielen lieben Dank, dass du für unsere Wolke in Vorkasse gegangen bist!
									☁️⚡
								</p>
								<p style="margin:0 0 18px 0;">Wir haben deine Auslage erhalten:</p>

								<!-- Detail card -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="background:#FDF2F8;border-radius:8px;margin:0 0 22px 0;"
								>
									<tbody>
										<tr>
											<td style="padding:14px 20px;">
												<table
													role="presentation"
													cellspacing="0"
													cellpadding="0"
													border="0"
													width="100%"
													style="font-size:13px;"
												>
													<tbody>
														<tr>
															<td
																style="padding:5px 0;color:#6B7280;width:140px;white-space:nowrap;vertical-align:top;"
																>AUS-ID</td
															>
															<td style="padding:5px 0;color:#1F2937;font-weight:700;">{ausId}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6B7280;white-space:nowrap;vertical-align:top;"
																>Bezeichnung</td
															>
															<td style="padding:5px 0;color:#1F2937;">{bezeichnung}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6B7280;white-space:nowrap;vertical-align:top;"
																>Betrag</td
															>
															<td style="padding:5px 0;color:#1F2937;font-weight:600;">{betragFmt}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6B7280;white-space:nowrap;vertical-align:top;"
																>Eingereicht am</td
															>
															<td style="padding:5px 0;color:#1F2937;">{datumFmt}</td>
														</tr>
													</tbody>
												</table>
											</td>
										</tr>
									</tbody>
								</table>

								<p style="margin:0 0 14px 0;">
									<strong style="color:#be185d;">Was jetzt passiert:</strong> Wir prüfen
									die Unterlagen und überweisen dir das Geld in der Regel innerhalb von 1–2 Wochen.
									Du bekommst nochmal eine Mail von uns, sobald es raus ist.
								</p>
								<p style="margin:0 0 18px 0;">
									Den aktuellen Stand deiner Auslage siehst du jederzeit hier:
								</p>

								<!-- CTA Button -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									style="margin:0 0 22px 0;"
								>
									<tbody>
										<tr>
											<td
												style="background:#be185d;border-radius:8px;text-align:center;"
											>
																	<a
													href={statusUrl}
													style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;"
													>Auslage-Status ansehen</a
												>
											</td>
										</tr>
									</tbody>
								</table>

								<p style="margin:0 0 24px 0;">
									Falls dir noch etwas auffällt oder du etwas korrigieren möchtest, melde dich
									einfach bei uns.
								</p>
								<p style="margin:0;font-size:15px;color:#be185d;">
									Mit besten Grüßen 💋<br /><strong
										>deine Folge der Wolke Finanz-Geschäftler:innen</strong
									>
								</p>
							</td>
						</tr>

						<!-- Footer -->
						<tr>
							<td
								style="background:#FBCFE8;padding:18px 40px;text-align:center;font-size:11px;color:#831843;"
							>
								Folge der Wolke e.V. · Westermühlstraße 6, 80469 München<br />
								VR 211227 · Steuernummer 143/215/10028<br />
								<br />
								Du erhältst diese Mail als Mitglied oder Einreichende:r bei Folge der Wolke e.V.
							</td>
						</tr>
					</tbody>
				</table>
			</td>
		</tr>
	</tbody>
</table>

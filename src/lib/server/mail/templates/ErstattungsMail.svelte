<script lang="ts">
	import type { ErstattungsMailProps } from '../types.js';

	let {
		vorname,
		ausId,
		bezeichnung,
		betragCents,
		verwendungszweck,
		erstattungsAm
	}: ErstattungsMailProps = $props();

	const betragFmt = $derived(
		(betragCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
	);
	const datumFmt = $derived(
		erstattungsAm.toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		})
	);
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
								style="background:linear-gradient(135deg,oklch(0.43 0.20 350) 0%,oklch(0.32 0.18 350) 100%);padding:30px 40px;"
							>
								<p
									style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;"
								>
									Folge der Wolke e.V.
								</p>
								<p style="margin:4px 0 0 0;color:#FBCFE8;font-size:13px;">
									Ein Liebesbrief von den Finanz-Gschaftler:innen
								</p>
							</td>
						</tr>

						<!-- Body -->
						<tr>
							<td style="padding:36px 40px;line-height:1.6;font-size:14px;">
								<p style="margin:0 0 14px 0;font-size:16px;color:oklch(0.43 0.20 350);">
									<strong>Liebste:r {vorname},</strong>
								</p>
								<p style="margin:0 0 18px 0;">
									Hallo! So, das war's mit dem Vorstrecken — wir haben deine Erstattung gerade
									rausgeschickt! 🚀
								</p>

								<!-- Detail card (green) -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="background:#D1FAE5;border-radius:8px;margin:0 0 22px 0;"
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
																style="padding:5px 0;color:#065F46;width:160px;white-space:nowrap;vertical-align:top;"
																>AUS-ID</td
															>
															<td style="padding:5px 0;color:#064E3B;font-weight:700;">{ausId}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#065F46;white-space:nowrap;vertical-align:top;"
																>Bezeichnung</td
															>
															<td style="padding:5px 0;color:#064E3B;">{bezeichnung}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#065F46;white-space:nowrap;vertical-align:top;"
																>Betrag</td
															>
															<td style="padding:5px 0;color:#064E3B;font-weight:700;">{betragFmt}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#065F46;white-space:nowrap;vertical-align:top;"
																>Überwiesen am</td
															>
															<td style="padding:5px 0;color:#064E3B;">{datumFmt}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#065F46;white-space:nowrap;vertical-align:top;"
																>Verwendungszweck</td
															>
															<td
																style="padding:5px 0;color:#064E3B;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:12px;"
																>{verwendungszweck}</td
															>
														</tr>
													</tbody>
												</table>
											</td>
										</tr>
									</tbody>
								</table>

								<p style="margin:0 0 18px 0;">
									Der Betrag sollte in den nächsten 1–3 Werktagen auf deinem Konto landen.
								</p>
								<p style="margin:0 0 24px 0;">
									Tausend Dank für deinen Einsatz für unsere Wolke. Ohne Menschen wie dich gäb's
									weniger Glitzer, Spaß und Magie. ✨
								</p>
								<p style="margin:0;font-size:15px;color:oklch(0.43 0.20 350);">
									Mit besten Grüßen 💋<br /><strong
										>deine Folge der Wolke Finanz-Gschaftler:innen</strong
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

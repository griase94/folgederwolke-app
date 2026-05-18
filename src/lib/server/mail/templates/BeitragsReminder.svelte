<script lang="ts">
	import type { BeitragsReminderProps } from '../types.js';

	let { vorname, nachname, jahr, betragCents, iban, bic, bank, empfaenger }: BeitragsReminderProps =
		$props();

	const betragFmt = $derived(
		(betragCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
	);

	// Format IBAN in 4-char groups: DE25830654080006894453 → DE25 8306 5408 0006 8944 53
	const ibanReadable = $derived(
		iban
			.replace(/\s+/g, '')
			.toUpperCase()
			.replace(/(.{4})/g, '$1 ')
			.trim()
	);

	const fullName = $derived(nachname ? `${vorname} ${nachname}`.trim() : vorname);
	const verwendungszweck = $derived(`Mitgliedsbeitrag ${jahr} ${fullName}`);
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
									Hallo! Kleine, sonnige Erinnerung — dein Mitgliedsbeitrag für
									<strong>{jahr}</strong> ist noch offen. ☀️
								</p>
								<p style="margin:0 0 18px 0;">Hier alles auf einen Blick zum Überweisen:</p>

								<!-- Payment card (amber) -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="background:#FEF3C7;border-radius:8px;margin:0 0 8px 0;"
								>
									<tbody>
										<tr>
											<td style="padding:16px 22px;">
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
																style="padding:6px 16px 6px 0;color:#92400E;width:170px;white-space:nowrap;vertical-align:top;"
																>Empfänger</td
															>
															<td style="padding:6px 0;color:#451A03;font-weight:600;"
																>{empfaenger}</td
															>
														</tr>
														<tr>
															<td
																style="padding:6px 16px 6px 0;color:#92400E;white-space:nowrap;vertical-align:top;"
																>IBAN</td
															>
															<td
																style="padding:6px 0;color:#451A03;font-family:'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:0.3px;"
																>{ibanReadable}</td
															>
														</tr>
														<tr>
															<td
																style="padding:6px 16px 6px 0;color:#92400E;white-space:nowrap;vertical-align:top;"
																>BIC</td
															>
															<td style="padding:6px 0;color:#451A03;">
																<span
																	style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;"
																	>{bic}</span
																>
																<span style="color:#92400E;"> ({bank})</span>
															</td>
														</tr>
														<tr>
															<td
																style="padding:6px 16px 6px 0;color:#92400E;white-space:nowrap;vertical-align:top;"
																>Betrag</td
															>
															<td style="padding:6px 0;color:#451A03;font-weight:700;">{betragFmt}</td>
														</tr>
														<tr>
															<td
																style="padding:6px 16px 6px 0;color:#92400E;white-space:nowrap;vertical-align:top;"
																>Verwendungszweck</td
															>
															<td style="padding:6px 0;color:#451A03;font-weight:600;"
																>{verwendungszweck}</td
															>
														</tr>
													</tbody>
												</table>
											</td>
										</tr>
									</tbody>
								</table>

								<p style="margin:0 0 18px 0;font-size:12px;color:#92400E;">
									<em
										>Bitte den Verwendungszweck genau so übernehmen — sonst können wir die Zahlung
										nicht zuordnen.</em
									>
								</p>
								<p style="margin:0 0 16px 0;">
									Mit deinem Beitrag finanzieren wir unser Folge der Wolke Wochenende, faire
									Künstler:innen-Honorare und alles, was unsere Wolke sonst noch so trägt. Danke,
									dass du dabei bist!
								</p>
								<p style="margin:0 0 24px 0;">
									Falls Geld dieses Jahr knapp ist: meld dich bei uns — wir können den Beitrag
									aussetzen oder reduzieren. Niemand fliegt deshalb raus. 💛
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
								Du erhältst diese Mail als Mitglied von Folge der Wolke e.V.
							</td>
						</tr>
					</tbody>
				</table>
			</td>
		</tr>
	</tbody>
</table>

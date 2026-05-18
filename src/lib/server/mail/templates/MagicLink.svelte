<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { MagicLinkProps } from '../types.js';

	let { email, magicUrl, expiresInMinutes }: MagicLinkProps = $props();
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
									Buchhaltungs-Verwaltung — Admin-Zugang
								</p>
							</td>
						</tr>

						<!-- Body -->
						<tr>
							<td style="padding:36px 40px;line-height:1.6;font-size:14px;">
								<p style="margin:0 0 18px 0;font-size:15px;">
									Hallo! Hier ist dein Anmelde-Link für die Folge der Wolke
									Buchhaltungs-Verwaltung.
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
													href={magicUrl}
													style="display:inline-block;padding:16px 40px;background:oklch(0.43 0.20 350);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.2px;"
												>
													Als {email} anmelden
												</a>
											</td>
										</tr>
									</tbody>
								</table>

								<!-- Expiry note -->
								<p style="margin:0 0 14px 0;text-align:center;font-size:12px;color:#6B7280;">
									Dieser Link ist <strong>{expiresInMinutes} Minuten</strong> gültig und kann nur
									einmal verwendet werden.
								</p>

								<!-- Divider -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="margin:24px 0;"
								>
									<tbody>
										<tr>
											<td style="border-top:1px solid #F3E8FF;font-size:1px;line-height:1px;"
												>&nbsp;</td
											>
										</tr>
									</tbody>
								</table>

								<!-- Security note -->
								<p
									style="margin:0 0 10px 0;font-size:13px;color:#6B7280;background:#F9FAFB;border-radius:6px;padding:12px 16px;border-left:3px solid oklch(0.43 0.20 350);"
								>
									<strong>Sicherheitshinweis:</strong> Dies ist ein Anmelde-Link. Wenn du ihn nicht
									angefordert hast, ignoriere diese Mail einfach — dein Konto bleibt sicher. Der
									Link läuft automatisch ab.
								</p>

								<!-- Click-through note (D13) -->
								<p style="margin:16px 0 0 0;font-size:12px;color:#9CA3AF;text-align:center;">
									Aus Sicherheitsgründen wirst du nach dem Klick noch einmal gefragt, ob du dich als
									<strong>{email}</strong> anmelden möchtest, bevor der Link eingelöst wird.
								</p>

								<p style="margin:24px 0 0 0;font-size:15px;color:oklch(0.43 0.20 350);">
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
								Du erhältst diese Mail, weil jemand einen Anmelde-Link für {email} angefordert hat.
							</td>
						</tr>
					</tbody>
				</table>
			</td>
		</tr>
	</tbody>
</table>

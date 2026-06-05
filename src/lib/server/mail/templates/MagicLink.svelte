<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import type { MagicLinkProps } from '../types.js';
	import MailFooter from './MailFooter.svelte';

	let {
		email,
		magicUrl,
		expiresInMinutes,
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = ''
	}: MagicLinkProps & {
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
	} = $props();
</script>

<!--
  Magic-link sign-in email.
  All colors are solid hex — Gmail/Outlook/iOS Mail strip oklch() and CSS variables,
  and gradients render unreliably in dark mode.
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
							<td
								style="background:#be185d;padding:18px 32px;border-radius:16px 16px 0 0;"
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
							<td style="padding:36px 32px 8px 32px;line-height:1.55;font-size:15px;color:#1f2937;">
								<h1
									style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.2px;"
								>
									Dein Anmelde-Link
								</h1>

								<p style="margin:0 0 28px 0;color:#374151;">
									Klick auf den Knopf, um dich in der Buchhaltung anzumelden.
								</p>

								<!-- CTA Button -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="margin:0 0 18px 0;"
								>
									<tbody>
										<tr>
											<td align="center">
												<a
													href={magicUrl}
													style="display:inline-block;padding:14px 32px;background:#be185d;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;"
												>
													Jetzt anmelden
												</a>
											</td>
										</tr>
									</tbody>
								</table>

								<p
									style="margin:0 0 28px 0;text-align:center;font-size:13px;color:#6b7280;"
								>
									Gültig für <strong style="color:#374151;">{expiresInMinutes} Minuten</strong>, einmalig verwendbar.
								</p>

								<!-- Fallback link (some clients strip styled buttons) -->
								<p style="margin:0 0 24px 0;font-size:12px;color:#9ca3af;line-height:1.5;">
									Funktioniert der Knopf nicht? Kopiere diesen Link in den Browser:<br />
									<span style="color:#6b7280;word-break:break-all;">{magicUrl}</span>
								</p>

								<!-- Divider -->
								<div
									style="border-top:1px solid #f1e6ec;margin:8px 0 22px 0;font-size:1px;line-height:1px;"
								>
									&nbsp;
								</div>

								<p style="margin:0 0 12px 0;font-size:13px;color:#6b7280;line-height:1.5;">
									Du wurdest gerade aufgefordert, dich als
									<strong style="color:#374151;">{email}</strong> anzumelden. Aus
									Sicherheitsgründen fragen wir nach dem Klick noch einmal nach, bevor
									wir dich einloggen.
								</p>
								<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
									Du hast keine Anmeldung angefordert? Ignoriere die Mail einfach —
									der Link läuft von selbst ab.
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

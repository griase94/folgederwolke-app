<script lang="ts">
	import type { RejectionMailProps } from '../types.js';
	import MailFooter from './MailFooter.svelte';

	let {
		vorname,
		ausId,
		bezeichnung,
		betragCents,
		grund,
		abgelehntAm,
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = ''
	}: RejectionMailProps & {
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
	} = $props();

	const betragFmt = $derived(
		(betragCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
	);
	const datumFmt = $derived(
		abgelehntAm.toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		})
	);
</script>

<!--
  Auslage-Ablehnung email. Always gentle tone; surfaces the rejection
  reason so the member can correct and resubmit. Brand-strip pattern
  matches MagicLink.svelte (UI-031, 2026-05-19 §3.13).
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
									Zu deiner Auslage
								</h1>

								<p style="margin:0 0 18px 0;color:#374151;">
									<strong>Liebste:r {vorname},</strong> wir haben deine Auslage geprüft und können
									sie leider in dieser Form noch nicht erstatten. Wir sagen dir aber genau warum,
									damit du sie ggf. korrigiert <strong>noch einmal</strong> einreichen kannst.
								</p>

								<!-- Detail card (neutral) -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="background:#fdf2f8;border-radius:12px;margin:0 0 18px 0;"
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
																>Geprüft am</td
															>
															<td style="padding:5px 0;color:#111827;">{datumFmt}</td>
														</tr>
													</tbody>
												</table>
											</td>
										</tr>
									</tbody>
								</table>

								<!-- Grund card (amber-50 / amber border per UI-031) -->
								<p style="margin:0 0 8px 0;color:#374151;">
									<strong>Unsere Begründung:</strong>
								</p>
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;margin:0 0 22px 0;"
								>
									<tbody>
										<tr>
											<td style="padding:14px 20px;color:#78350f;font-size:13px;line-height:1.6;">
												{grund}
											</td>
										</tr>
									</tbody>
								</table>

								<p style="margin:0 0 24px 0;color:#374151;">
									Wenn du den Beleg in korrigierter Form noch einmal einreichen möchtest, kannst du
									das jederzeit über das Auslagen-Formular tun. Bei Fragen — schreib uns einfach
									zurück.
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

<script lang="ts">
	import type { ErstattungsMailProps } from '../types.js';
	import MailFooter from './MailFooter.svelte';

	let {
		vorname,
		ausId,
		bezeichnung,
		betragCents,
		verwendungszweck,
		erstattungsAm,
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = ''
	}: ErstattungsMailProps & {
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
	} = $props();

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
	import { BRAND_PRIMARY_STRONG } from '$lib/brand.js';
</script>

<!--
  Auslage-Erstattung confirmation email.
  Brand-strip pattern matches MagicLink.svelte (UI-031, 2026-05-19 §3.13).
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
									Deine Erstattung ist raus
								</h1>

								<p style="margin:0 0 16px 0;color:#374151;">
									<strong>Liebste:r {vorname},</strong> deine Erstattung für deine Auslage ist
									gerade rausgegangen — Vorkasse-Modus aus, Wolken-Modus an.
								</p>

								<!-- Detail card (emerald-50 = success affordance, UI-031) -->
								<table
									role="presentation"
									cellspacing="0"
									cellpadding="0"
									border="0"
									width="100%"
									style="background:#d1fae5;border-radius:12px;margin:0 0 22px 0;"
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
													style="font-size:13px;"
												>
													<tbody>
														<tr>
															<td
																style="padding:5px 0;color:#065f46;width:160px;white-space:nowrap;vertical-align:top;"
																>AUS-ID</td
															>
															<td style="padding:5px 0;color:#064e3b;font-weight:700;">{ausId}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#065f46;white-space:nowrap;vertical-align:top;"
																>Bezeichnung</td
															>
															<td style="padding:5px 0;color:#064e3b;">{bezeichnung}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#065f46;white-space:nowrap;vertical-align:top;"
																>Betrag</td
															>
															<td style="padding:5px 0;color:#064e3b;font-weight:700;">{betragFmt}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#065f46;white-space:nowrap;vertical-align:top;"
																>Überwiesen am</td
															>
															<td style="padding:5px 0;color:#064e3b;">{datumFmt}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#065f46;white-space:nowrap;vertical-align:top;"
																>Verwendungszweck</td
															>
															<td
																style="padding:5px 0;color:#064e3b;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:12px;"
																>{verwendungszweck}</td
															>
														</tr>
													</tbody>
												</table>
											</td>
										</tr>
									</tbody>
								</table>

								<p style="margin:0 0 16px 0;color:#374151;">
									Der Betrag sollte in den nächsten 1–3 Werktagen auf deinem Konto landen.
								</p>
								<p style="margin:0 0 24px 0;color:#374151;">
									Tausend Dank für deinen Einsatz für unsere Wolke.
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

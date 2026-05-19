<script lang="ts">
	import type { InvoiceVersendetMailProps } from '../types.js';

	let {
		customerName,
		invoiceNumber,
		bezeichnung,
		bruttoCents,
		currency,
		rechnungsdatum,
		faelligkeitsDatum,
		downloadUrl
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
</script>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#FCE7F3;">
	<tbody>
		<tr>
			<td align="center" style="padding:30px 16px;">
				<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
					<tbody>
						<tr>
							<td style="background:#be185d;padding:30px 40px;">
								<p style="margin:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">Folge der Wolke e.V.</p>
								<p style="margin:4px 0 0 0;color:#FBCFE8;font-size:13px;">Eine Rechnung von uns</p>
							</td>
						</tr>
						<tr>
							<td style="padding:36px 40px;line-height:1.6;font-size:14px;">
								<p style="margin:0 0 14px 0;font-size:16px;color:#be185d;"><strong>Liebe:r {customerName},</strong></p>
								<p style="margin:0 0 16px 0;">anbei sende ich dir/Ihnen unsere Rechnung im Anhang. Hier sind die wichtigsten Eckdaten:</p>
								<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#FDF2F8;border-radius:8px;margin:0 0 22px 0;">
									<tbody>
										<tr>
											<td style="padding:14px 20px;">
												<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size:13px;">
													<tbody>
														<tr><td style="padding:5px 0;color:#6B7280;width:140px;white-space:nowrap;vertical-align:top;">Rechnungs-Nr.</td><td style="padding:5px 0;color:#1F2937;font-weight:700;">{invoiceNumber}</td></tr>
														<tr><td style="padding:5px 0;color:#6B7280;white-space:nowrap;vertical-align:top;">Bezeichnung</td><td style="padding:5px 0;color:#1F2937;">{bezeichnung}</td></tr>
														<tr><td style="padding:5px 0;color:#6B7280;white-space:nowrap;vertical-align:top;">Betrag</td><td style="padding:5px 0;color:#1F2937;font-weight:600;">{bruttoFmt}</td></tr>
														<tr><td style="padding:5px 0;color:#6B7280;white-space:nowrap;vertical-align:top;">Rechnungsdatum</td><td style="padding:5px 0;color:#1F2937;">{datumFmt}</td></tr>
														{#if faelligFmt}
															<tr><td style="padding:5px 0;color:#6B7280;white-space:nowrap;vertical-align:top;">Faellig bis</td><td style="padding:5px 0;color:#1F2937;">{faelligFmt}</td></tr>
														{/if}
													</tbody>
												</table>
											</td>
										</tr>
									</tbody>
								</table>
								{#if downloadUrl}
									<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;">
										<tbody>
											<tr>
												<td style="background:#be185d;border-radius:8px;text-align:center;">
													<!-- eslint-disable svelte/no-navigation-without-resolve --><a href={downloadUrl} style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Rechnung herunterladen</a>
												</td>
											</tr>
										</tbody>
									</table>
								{/if}
								<p style="margin:0 0 14px 0;">Bei Rueckfragen zur Rechnung melde dich gerne jederzeit.</p>
								<p style="margin:0;font-size:15px;color:#be185d;">Mit herzlichen Grüßen<br /><strong>deine Folge der Wolke Finanz-Geschäftler:innen</strong></p>
							</td>
						</tr>
						<tr>
							<td style="background:#FBCFE8;padding:18px 40px;text-align:center;font-size:11px;color:#831843;">Folge der Wolke e.V. - Westermuehlstrasse 6, 80469 Muenchen<br />VR 211227 - Steuernummer 143/215/10028</td>
						</tr>
					</tbody>
				</table>
			</td>
		</tr>
	</tbody>
</table>

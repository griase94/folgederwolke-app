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
		items = undefined,
		baseUrl = '',
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = ''
	}: EingangsMailProps & {
		/** Absolute public origin (PUBLIC_BASE_URL) — makes the CTA link
		 *  absolute so it works in email clients (Task 2.3). Injected by sendMail. */
		baseUrl?: string;
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
	} = $props();

	// Batch digest: >1 Auslage in one submit → render a grouped list + total.
	const isBatch = $derived(Array.isArray(items) && items.length > 1);
	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	const betragFmt = $derived(eur(betragCents));
	const datumFmt = $derived(
		eingereichtAm.toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		})
	);
	// Absolute status link — relative paths are dead in email clients
	// (Task 2.3). baseUrl comes from PUBLIC_BASE_URL via sendMail; strip any
	// trailing slash so we never emit a double slash.
	const statusUrl = $derived(`${baseUrl.replace(/\/+$/, '')}/auslage-status/${ausId}`);
	import { BRAND_PRIMARY_STRONG } from '$lib/brand.js';
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
					style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #f1e6ec;"
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
									{isBatch ? 'Auslagen eingegangen' : 'Auslage eingegangen'}
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
												{#if isBatch && items}
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
														<td colspan="2" style="padding:0 0 10px 0;color:#6b7280;white-space:nowrap;"
															>{items.length} Auslagen · eingereicht am {datumFmt}</td
														>
													</tr>
													{#each items as item (item.ausId)}
														<tr>
															<td style="padding:5px 0;color:#111827;vertical-align:top;">
																<strong>{item.ausId}</strong><br />
																<span style="color:#6b7280;">{item.bezeichnung}</span>
															</td>
															<td
																style="padding:5px 0;color:#111827;font-weight:600;text-align:right;white-space:nowrap;vertical-align:top;"
																>{eur(item.betragCents)}</td
															>
														</tr>
													{/each}
													<tr>
														<td style="padding:12px 0 0 0;border-top:1px solid #f1c6de;color:#111827;font-weight:700;"
															>Gesamt</td
														>
														<td
															style="padding:12px 0 0 0;border-top:1px solid #f1c6de;color:#111827;font-weight:700;text-align:right;white-space:nowrap;"
															>{betragFmt}</td
														>
													</tr>
												</tbody>
											</table>
										{:else}
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
										{/if}
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
													style="display:inline-block;padding:14px 32px;background:{BRAND_PRIMARY_STRONG};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;"
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

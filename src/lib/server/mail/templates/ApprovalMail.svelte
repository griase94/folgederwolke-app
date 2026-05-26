<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	type Props = {
		vorname: string;
		ausId: string;
		bezeichnung: string;
		betragCents: number;
		kategorie: string;
		decidedAt: string;
	};
	let { vorname, ausId, bezeichnung, betragCents, kategorie, decidedAt }: Props = $props();

	const betrag = $derived(
		(betragCents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
	);
	const datum = $derived(
		new Date(decidedAt).toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		})
	);
</script>

<!--
  ApprovalMail — sent when an admin approves an Auslage submission.
  Brand-strip pattern matches EingangsMail.svelte.
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
									Folge der Wolke
								</p>
							</td>
						</tr>

						<!-- Body -->
						<tr>
							<td style="padding:36px 32px 8px 32px;line-height:1.55;font-size:15px;color:#1f2937;">
								<h1
									style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.2px;"
								>
									Auslage genehmigt
								</h1>

								<p style="margin:0 0 16px 0;color:#374151;">
									<strong>Hallo {vorname},</strong> gute Neuigkeit! Deine Auslage wurde geprüft und
									genehmigt.
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
															<td style="padding:5px 0;color:#111827;font-weight:600;">{betrag}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6b7280;white-space:nowrap;vertical-align:top;"
																>Kategorie</td
															>
															<td style="padding:5px 0;color:#111827;">{kategorie}</td>
														</tr>
														<tr>
															<td
																style="padding:5px 0;color:#6b7280;white-space:nowrap;vertical-align:top;"
																>Genehmigt am</td
															>
															<td style="padding:5px 0;color:#111827;">{datum}</td>
														</tr>
													</tbody>
												</table>
											</td>
										</tr>
									</tbody>
								</table>

								<p style="margin:0 0 18px 0;color:#374151;">
									Du erhältst eine weitere E-Mail, sobald die Erstattung auf dein Konto angewiesen
									ist.
								</p>

								<!-- Divider -->
								<div
									style="border-top:1px solid #f1e6ec;margin:8px 0 22px 0;font-size:1px;line-height:1px;"
								>
									&nbsp;
								</div>

								<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
									Mit besten Grüßen,<br /><strong style="color:#374151;"
										>deine Folge der Wolke Finanz-Geschäftler:innen</strong
									>
								</p>
							</td>
						</tr>

						<!-- Footer -->
						<tr>
							<td
								style="padding:24px 32px 28px 32px;text-align:center;font-size:11px;color:#9ca3af;line-height:1.6;border-top:1px solid #f1e6ec;"
							>
								<strong style="color:#6b7280;">Folge der Wolke e.V.</strong> · Westermühlstraße 6,
								80469 München<br />
								VR 211227 · Steuernummer 143/215/10028
							</td>
						</tr>
					</tbody>
				</table>
			</td>
		</tr>
	</tbody>
</table>

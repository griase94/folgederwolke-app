<script lang="ts">
	/**
	 * MailShell — page background, 560px card, brand strip, body inset, footer.
	 *
	 * The Auslagen decision mails (approved / abgelehnt / erstattet) render their
	 * blocks into `children`; everything around them lives here exactly once, so
	 * "the mails look like one suite" is a property of the code, not of three
	 * copies staying in sync. The other five templates still carry their own
	 * shell — they adopt this one when their own brief is built.
	 *
	 * The brand strip is the ONLY pink surface (briefs §4 colour hierarchy) and
	 * renders the runtime Verein name, never a hardcoded literal (white-label
	 * Task 2.2).
	 */
	import type { Snippet } from 'svelte';
	import MailFooter from '../MailFooter.svelte';
	import { BRAND_PRIMARY_STRONG } from '$lib/brand.js';
	import { HAIRLINE, INK_700, PAGE_BG } from './tokens.js';

	let {
		vereinName = '',
		adresse = '',
		vr = '',
		steuernummer = '',
		children
	}: {
		vereinName?: string;
		adresse?: string;
		vr?: string;
		steuernummer?: string;
		children: Snippet;
	} = $props();
</script>

<table
	role="presentation"
	cellspacing="0"
	cellpadding="0"
	border="0"
	width="100%"
	style="background:{PAGE_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"
>
	<tbody>
		<tr>
			<td align="center" style="padding:40px 16px;">
				<!-- width:100% + max-width is the bulletproof pair: CSS-capable clients
				     shrink the card on a phone (the `width="560"` attribute alone keeps
				     it 560px wide and forces horizontal scrolling), while Outlook's Word
				     engine reads the attribute and still gets a 560px card. -->
				<table
					role="presentation"
					cellspacing="0"
					cellpadding="0"
					border="0"
					width="560"
					style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;border:1px solid {HAIRLINE};"
				>
					<tbody>
						<!-- Brand strip -->
						<tr>
							<td
								style="background:{BRAND_PRIMARY_STRONG};padding:18px 32px;border-radius:16px 16px 0 0;"
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
							<td style="padding:34px 32px 28px 32px;line-height:1.55;font-size:15px;color:{INK_700};">
								{@render children()}
							</td>
						</tr>

						<MailFooter {vereinName} {adresse} {vr} {steuernummer} />
					</tbody>
				</table>
			</td>
		</tr>
	</tbody>
</table>

<!--
  InvoicePdfStatusBadge — tiny pill showing the PDF generation status of an
  invoice. Color-coded for at-a-glance scanning in the list AND detail view.

  Phase 11: derived purely from pdfStatus + presence of pdfFileId. The legacy
  driveStatus axis is gone — invoices now persist directly to Vercel Blob via
  the files table, so a successful generation means the blob exists.

  Aurora (E2-3): recoloured from ad-hoc Tailwind palette colours to the shared
  severity/type-einnahme tokens so this badge matches every other status chip
  in the app (InvoiceListRow, InvoiceCardMobile) instead of its own palette.
-->
<script lang="ts">
	import type { InvoicePdfStatus } from '$lib/domain/invoices.js';
	import { pdfStatusLabel } from '$lib/domain/invoices.js';

	let {
		pdfStatus,
		hasFile = false
	}: {
		pdfStatus: InvoicePdfStatus;
		/** True once the matching files row exists. Belt-and-braces: if pdfStatus
		 *  is 'generated' but the file is missing (shouldn't happen with the new
		 *  state machine), we degrade to "Fehler" tone. */
		hasFile?: boolean;
	} = $props();

	const effectiveStatus = $derived<InvoicePdfStatus>(
		pdfStatus === 'generated' && !hasFile ? 'failed' : pdfStatus
	);
	const meta = $derived(pdfStatusLabel(effectiveStatus));

	const toneClass = $derived.by(() => {
		switch (meta.tone) {
			case 'primary':
				return 'border-type-einnahme/25 bg-type-einnahme-tint text-type-einnahme';
			case 'warning':
				return 'border-severity-warn/30 bg-severity-warn-tint text-severity-warn-text';
			case 'destructive':
				return 'border-severity-critical/30 bg-severity-critical/10 text-severity-critical-text';
			default:
				return 'border-border bg-secondary text-ink-500';
		}
	});
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold {toneClass}"
	title={meta.label}
	data-testid="invoice-pdf-status-badge"
	data-status={effectiveStatus}
>
	{#if effectiveStatus === 'running' || effectiveStatus === 'queued'}
		<span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current"></span>
	{/if}
	{meta.label}
</span>

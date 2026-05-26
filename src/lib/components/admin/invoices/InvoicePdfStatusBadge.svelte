<!--
  InvoicePdfStatusBadge — tiny pill showing the PDF generation status of an
  invoice. Color-coded for at-a-glance scanning in the list view.

  Phase 11: derived purely from pdfStatus + presence of pdfFileId. The legacy
  driveStatus axis is gone — invoices now persist directly to Vercel Blob via
  the files table, so a successful generation means the blob exists.
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
				return 'border-emerald-200 bg-emerald-50 text-emerald-700';
			case 'warning':
				return 'border-amber-200 bg-amber-50 text-amber-700';
			case 'destructive':
				return 'border-red-200 bg-red-50 text-red-700';
			default:
				return 'border-border bg-muted text-muted-foreground';
		}
	});
</script>

<span
	class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium {toneClass}"
	title={meta.label}
>
	{#if effectiveStatus === 'running' || effectiveStatus === 'queued'}
		<span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current"></span>
	{/if}
	{meta.label}
</span>

<!--
  InvoicePdfStatusBadge — tiny pill showing the PDF generation status of an
  invoice. Color-coded for at-a-glance scanning in the list view.
-->
<script lang="ts">
	import type { InvoicePdfStatus, InvoiceDriveStatus } from '$lib/domain/invoices.js';
	import { pdfStatusLabel, driveStatusLabel } from '$lib/domain/invoices.js';

	let {
		pdfStatus,
		driveStatus = null,
		showDrive = false
	}: {
		pdfStatus: InvoicePdfStatus;
		driveStatus?: InvoiceDriveStatus;
		showDrive?: boolean;
	} = $props();

	const meta = $derived(pdfStatusLabel(pdfStatus));
	const driveLabel = $derived(driveStatusLabel(driveStatus));

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
	title={driveLabel && showDrive ? `${meta.label} · ${driveLabel}` : meta.label}
>
	{#if pdfStatus === 'running' || pdfStatus === 'queued'}
		<span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current"></span>
	{/if}
	{meta.label}
	{#if showDrive && driveLabel && driveStatus === 'failed'}
		<span aria-hidden="true" class="ml-1 text-red-600">⚠</span>
	{/if}
</span>

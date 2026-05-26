<script lang="ts">
	import InvoiceList from './InvoiceList.svelte';
	import type { InvoiceRow } from '$lib/domain/invoices.js';

	let { invoices, today = '2026-05-26' }: { invoices: InvoiceRow[]; today?: string } = $props();
</script>

<InvoiceList {invoices} {today} />

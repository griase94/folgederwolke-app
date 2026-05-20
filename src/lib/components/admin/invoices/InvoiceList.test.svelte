<script lang="ts">
	import InvoiceList from './InvoiceList.svelte';
	import type { InvoiceRow } from '$lib/domain/invoices.js';

	let { invoices }: { invoices: InvoiceRow[] } = $props();
</script>

<InvoiceList {invoices} />

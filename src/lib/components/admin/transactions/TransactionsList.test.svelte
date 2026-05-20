<script lang="ts">
	import TransactionsList from './TransactionsList.svelte';
	import type { TransactionRow } from '$lib/server/domain/transactions.js';

	let { rows, total }: { rows: TransactionRow[]; total: number } = $props();
</script>

<TransactionsList
	{rows}
	{total}
	zahlungsarten={[]}
	approvedPending={[]}
	filters={{}}
/>

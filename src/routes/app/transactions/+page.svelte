<script lang="ts">
	import { page } from '$app/state';
	import TransactionsList from '$lib/components/admin/transactions/TransactionsList.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Transaktionen – {page.data.vereinName}</title>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-8 sm:px-6">
	<!-- ── Header ──────────────────────────────────────────────────────────── -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground">Transaktionen</h1>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Ausgaben, Einnahmen und Spenden in einer Ansicht
			</p>
		</div>
		<div class="flex gap-2">
			<Button href="/app/transactions/neu" size="sm">
				<svg
					class="mr-1.5 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				Neue Transaktion
			</Button>
		</div>
	</div>

	<!-- ── Transactions list ───────────────────────────────────────────────── -->
	<TransactionsList
		rows={data.rows}
		total={data.total}
		zahlungsarten={data.zahlungsarten}
		approvedPending={data.approvedPending}
		filters={data.filters}
	/>
</div>

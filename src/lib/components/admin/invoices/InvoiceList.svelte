<!--
  InvoiceList - stacked list of invoices on /app/rechnungen.
  Empty state mirrors the CustomerList component for visual consistency.
-->
<script lang="ts">
	import InvoiceListRow from './InvoiceListRow.svelte';
	import type { InvoiceRow } from '$lib/domain/invoices.js';

	let { invoices }: { invoices: InvoiceRow[] } = $props();
</script>

{#if invoices.length === 0}
	<div
		class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center"
	>
		<svg
			class="h-12 w-12 text-muted-foreground/50"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="1"
			aria-hidden="true"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m-7 5h8a2 2 0 002-2V7a2 2 0 00-2-2h-3.586a1 1 0 01-.707-.293L11 3H5a2 2 0 00-2 2v14a2 2 0 002 2z" />
		</svg>
		<div>
			<p class="font-medium text-foreground">Noch keine Rechnungen</p>
			<p class="mt-1 text-sm text-muted-foreground">
				Lege die erste Rechnung mit dem Button oben an.
			</p>
		</div>
	</div>
{:else}
	<div class="space-y-2" role="list" aria-label="Rechnungsliste">
		{#each invoices as invoice (invoice.id)}
			<div role="listitem">
				<InvoiceListRow {invoice} />
			</div>
		{/each}
	</div>
{/if}

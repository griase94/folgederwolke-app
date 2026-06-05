<script lang="ts">
	/**
	 * Einnahmen Bezeichnung cell — Phase 5 / Task 2 (Tier C2).
	 *
	 * Renders the income Bezeichnung plus a read-only "aus Rechnung" badge (a §13
	 * lucide Link icon, NOT an emoji glyph) when (and only when) the row was
	 * created by the shipped `markInvoiceAsPaid` flow — i.e. `rechnungBusinessId`
	 * is non-null (the Phase-2 projection field). The badge is purely
	 * informational here (the detail page links to the Rechnung); it carries an
	 * accessible name "aus Rechnung {id}".
	 *
	 * Einnahmen owns NO invoice query — `rechnungBusinessId` comes straight off
	 * the `EinnahmenRow` projection (no `invoices` import here, per Task 4 fence).
	 */
	import LinkIcon from '@lucide/svelte/icons/link';

	interface Props {
		bezeichnung: string;
		rechnungBusinessId: string | null;
	}

	let { bezeichnung, rechnungBusinessId }: Props = $props();
</script>

<span class="inline-flex items-center gap-1.5">
	<span class="font-medium text-foreground">{bezeichnung}</span>
	{#if rechnungBusinessId}
		<span
			data-slot="rechnung-badge"
			class="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
			title={`aus Rechnung ${rechnungBusinessId}`}
			aria-label={`aus Rechnung ${rechnungBusinessId}`}
		>
			<LinkIcon class="size-3" aria-hidden="true" />
			<span class="font-mono">{rechnungBusinessId}</span>
		</span>
	{/if}
</span>

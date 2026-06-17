<!--
  DecidedBanner — read-only decided state (spec §2.4). Replaces the decision
  band once a row is decided. Approved → "Freigegeben · {Betrag} · {Datum}" +
  "Zur Ausgabe →" (when linked). Rejected → "Abgelehnt · {Datum}" + Grund.
-->
<script lang="ts">
	import { formatMoney } from '$lib/components/ui/money/money.svelte';

	let {
		decision,
		decidedAt,
		betragCents,
		decisionReason,
		linkedExpenseId
	}: {
		decision: 'approved' | 'rejected' | null;
		decidedAt: string | null;
		betragCents: number;
		decisionReason: string | null;
		linkedExpenseId: string | null;
	} = $props();

	function formatDate(d: string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('de-DE');
	}
</script>

<div
	role="status"
	data-testid="decided-banner"
	class="flex flex-col gap-3 rounded-2xl border border-hairline bg-secondary/40 px-4 py-3"
>
	{#if decision === 'approved'}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-2 text-sm">
				<span
					class="inline-flex items-center rounded-full bg-type-einnahme-tint px-2 py-0.5 text-[11px] font-semibold text-type-einnahme"
					>Freigegeben</span
				>
				<span class="text-ink-700">{formatMoney(betragCents, 'never')} · {formatDate(decidedAt)}</span>
			</div>
			{#if linkedExpenseId}
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={`/app/ausgaben/${linkedExpenseId}`}
					class="inline-flex min-h-11 items-center gap-1 rounded-full border border-hairline bg-white px-3 text-sm font-medium text-primary-text hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-10"
					>Zur Ausgabe →</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
		</div>
	{:else if decision === 'rejected'}
		<div class="flex items-center gap-2 text-sm">
			<span
				class="inline-flex items-center rounded-full bg-severity-warn/15 px-2 py-0.5 text-[11px] font-semibold text-severity-warn-text"
				>Abgelehnt</span
			>
			<span class="text-ink-700">{formatDate(decidedAt)}</span>
		</div>
		{#if decisionReason}
			<div class="rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink-700">
				<p class="mb-1 text-xs font-medium uppercase tracking-wide text-ink-500">Grund</p>
				<p class="whitespace-pre-line text-ink-900">{decisionReason}</p>
			</div>
		{/if}
	{/if}
</div>

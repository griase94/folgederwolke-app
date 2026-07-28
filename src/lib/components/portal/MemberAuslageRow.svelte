<!--
	MemberAuslageRow — one row in the member portal's "Meine Auslagen" list
	(Aurora A-flow S2a). Read-only: it carries a submission's title, AUS-Nr,
	Rechnungsdatum, amount (ALWAYS plum — the chip carries the tone, never the
	number), and status chip. S2a has no member detail route yet, so the row is
	a display row (no link); it becomes a link to /portal/auslagen/[id] in S2b.
-->
<script lang="ts">
	import { Receipt } from '@lucide/svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import AuslageStatusChip from '$lib/components/ui/AuslageStatusChip.svelte';
	import { statusPresentation } from '$lib/components/auslagen/status-presentation.js';
	import type { AuslageStatus } from '$lib/server/domain/auslage-status.js';

	interface Props {
		businessId: string;
		bezeichnung: string;
		betragCents: number;
		rechnungsdatum: string | null;
		status: AuslageStatus;
	}

	let { businessId, bezeichnung, betragCents, rechnungsdatum, status }: Props = $props();

	const presentation = $derived(statusPresentation(status));
	const shortDate = $derived(
		rechnungsdatum
			? new Date(`${rechnungsdatum}T00:00:00`).toLocaleDateString('de-DE', {
					day: '2-digit',
					month: '2-digit'
				})
			: null
	);
</script>

<div
	class="flex items-center gap-3 px-4 py-3"
	data-testid="member-auslage-row"
	data-status={status}
>
	<span
		class="grid size-9 shrink-0 place-items-center rounded-full bg-type-ausgabe-tint text-type-ausgabe [&_svg]:size-4"
		aria-hidden="true"
	>
		<Receipt />
	</span>

	<div class="min-w-0 flex-1">
		<div class="truncate text-sm font-semibold text-ink-900">{bezeichnung}</div>
		<div class="truncate text-xs tabular-nums text-ink-500">{businessId}</div>
	</div>

	{#if shortDate}
		<div class="hidden shrink-0 text-xs tabular-nums text-ink-500 sm:block">{shortDate}</div>
	{/if}

	<div class="shrink-0 text-sm font-semibold tabular-nums text-type-ausgabe">
		{formatMoney(betragCents)}
	</div>

	<div class="flex w-[112px] shrink-0 justify-end">
		<AuslageStatusChip variant={presentation.chip} label={presentation.pill} />
	</div>
</div>

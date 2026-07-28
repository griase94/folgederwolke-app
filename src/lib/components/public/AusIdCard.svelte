<!--
	AusIdCard — the single-Auslage receipt card (Aurora A-flow S1, plate
	`.aus-idcard`). Shown on auslage-eingereicht for n=1: the AUS-Nr (tabular,
	never wraps), the amount (PLUM — `type-ausgabe`, never green even here), and
	a green "Beleg angehängt" confirmation row. Read-only receipt.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import Check from '@lucide/svelte/icons/check';

	export interface AusIdCardProps {
		ausId: string;
		betragCents: number;
		/** Beleg filename for the confirmation row; omit to hide it. */
		belegName?: string | null;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		ausId,
		betragCents,
		belegName,
		class: className,
		'data-testid': testId = 'aus-id-card'
	}: AusIdCardProps = $props();
</script>

<div
	class={cn(
		'w-full overflow-hidden rounded-[16px] border border-border bg-[color-mix(in_srgb,var(--type-ausgabe)_4%,var(--card))] text-left',
		className
	)}
	data-testid={testId}
	data-slot="aus-id-card"
>
	<div class="flex items-center gap-3 px-4 py-3.5">
		<span class="text-[12.5px] font-medium text-ink-500">Deine Auslage-Nummer</span>
		<span class="ml-auto text-[15px] font-bold tracking-[0.02em] tabular-nums whitespace-nowrap text-ink-900">
			{ausId}
		</span>
	</div>
	<div class="flex items-center gap-3 border-t border-hairline px-4 py-3.5">
		<span class="text-[12.5px] font-medium text-ink-500">Betrag</span>
		<span class="ml-auto text-[20px] font-extrabold tabular-nums text-type-ausgabe" data-testid="aus-id-card-amount">
			{formatMoney(betragCents)}
		</span>
	</div>
	{#if belegName}
		<div
			class="flex items-center gap-2 border-t border-hairline bg-type-einnahme-tint px-4 py-2.5 text-[12px] font-semibold text-type-einnahme [&_svg]:size-3.5"
		>
			<Check aria-hidden="true" />
			<span class="min-w-0 truncate">Beleg {belegName} angehängt</span>
		</div>
	{/if}
</div>

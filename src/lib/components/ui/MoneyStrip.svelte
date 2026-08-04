<!--
	MoneyStrip — "what is outstanding, at a glance" (Aurora A-flow S3.1, kit `.mstrip`).

	One sum, then equal-width count chips. The chips are deliberately the same
	width (Abnahme #6): "Erstattungen 4" and "IBAN fehlt 1" sitting at different
	widths made the second look like an afterthought rather than a number the
	admin has to act on.

	The amount is plum (`type-ausgabe`) in every state — an Auslage is an
	Ausgabe whether it is waiting, blocked or done. Tone lives on the chips.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';

	export interface MoneyStripChip {
		label: string;
		count: number;
		/** `crit` marks a blocking count (IBAN fehlt); default is neutral. */
		tone?: 'neutral' | 'crit';
		testId?: string;
	}

	export interface MoneyStripProps {
		/** Eyebrow above the sum, e.g. "Offen · wartet auf Überweisung". */
		eyebrow: string;
		totalCents: number;
		chips?: MoneyStripChip[];
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		eyebrow,
		totalCents,
		chips = [],
		class: className,
		'data-testid': testId = 'money-strip'
	}: MoneyStripProps = $props();
</script>

<div
	class={cn('rounded-2xl border border-hairline bg-card p-4 sm:p-5', className)}
	data-testid={testId}
>
	<p class="text-[11px] font-bold tracking-wide text-ink-500 uppercase">{eyebrow}</p>
	<p
		class="mt-1 text-[30px] leading-none font-extrabold tabular-nums text-type-ausgabe"
		data-testid="money-strip-total"
	>
		{formatMoney(totalCents)}
	</p>

	{#if chips.length > 0}
		<!-- Equal columns, so the counts line up and none looks secondary. -->
		<div
			class="mt-3 grid gap-2"
			style="grid-template-columns: repeat({chips.length}, minmax(0, 1fr));"
		>
			{#each chips as chip (chip.label)}
				<span
					data-testid={chip.testId}
					class={cn(
						'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold',
						chip.tone === 'crit'
							? 'border-severity-critical/30 bg-severity-critical-tint text-severity-critical-text'
							: 'border-hairline bg-secondary text-ink-700'
					)}
				>
					{chip.label}
					<span class="tabular-nums">{chip.count}</span>
				</span>
			{/each}
		</div>
	{/if}
</div>

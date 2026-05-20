<script lang="ts">
	import type { TransactionKind } from '$lib/server/domain/transactions.js';

	interface Props {
		activeKind: TransactionKind | undefined;
		counts?: { expense?: number; income?: number; donation?: number };
		onchange: (kind: TransactionKind | undefined) => void;
	}

	let { activeKind, counts = {}, onchange }: Props = $props();

	const tabs: { kind: TransactionKind | undefined; label: string }[] = [
		{ kind: undefined, label: 'Alle' },
		{ kind: 'expense', label: 'Ausgaben' },
		{ kind: 'income', label: 'Einnahmen' },
		{ kind: 'donation', label: 'Spenden' },
	];
</script>

<!--
  Mobile (< sm) → horizontally scrollable strip so the four tabs can't clip
  the viewport at 390px (PM-008). The tablist itself stays inline-flex so
  tabs don't wrap mid-row.
-->
<div
	class="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	role="tablist"
	aria-label="Transaktionstyp"
>
	{#each tabs as tab (tab.kind ?? 'all')}
		<button
			role="tab"
			aria-selected={activeKind === tab.kind}
			onclick={() => onchange(tab.kind)}
			class={[
				'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
				activeKind === tab.kind
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground',
			].join(' ')}
		>
			{tab.label}
			{#if tab.kind && counts[tab.kind] !== undefined}
				<span
					class={[
						'rounded-full px-1.5 py-0.5 text-xs',
						activeKind === tab.kind
							? 'bg-primary/10 text-primary'
							: 'bg-muted-foreground/20 text-muted-foreground',
					].join(' ')}
				>
					{counts[tab.kind]}
				</span>
			{/if}
		</button>
	{/each}
</div>

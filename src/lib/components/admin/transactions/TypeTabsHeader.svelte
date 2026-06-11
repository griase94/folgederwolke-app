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

	// WAI-ARIA tablist keyboard nav (roving tabindex): only the active tab is in
	// the tab order; ArrowLeft/Right (+ Home/End) move focus AND activate the
	// next/previous tab, wrapping at the ends. This is the "automatic activation"
	// tabs pattern — selection follows focus.
	let tabEls = $state<(HTMLButtonElement | null)[]>([]);

	function activeIndex(): number {
		const i = tabs.findIndex((t) => t.kind === activeKind);
		return i === -1 ? 0 : i;
	}

	function focusTab(index: number) {
		const next = (index + tabs.length) % tabs.length;
		onchange(tabs[next]!.kind);
		// Move focus to the newly-activated tab (roving tabindex).
		tabEls[next]?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				e.preventDefault();
				focusTab(activeIndex() + 1);
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				e.preventDefault();
				focusTab(activeIndex() - 1);
				break;
			case 'Home':
				e.preventDefault();
				focusTab(0);
				break;
			case 'End':
				e.preventDefault();
				focusTab(tabs.length - 1);
				break;
		}
	}
</script>

<!--
  Mobile (< sm) → horizontally scrollable strip so the four tabs can't clip
  the viewport at 390px (PM-008). The tablist itself stays inline-flex so
  tabs don't wrap mid-row.

  C7-5 — scroll-snap so chips land at predictable rest points on
  flick-scroll, and a right-edge fade mask so users can SEE there's more
  content to scroll into rather than guessing.
-->
<div
	class="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_92%,transparent)]"
	role="tablist"
	tabindex="-1"
	aria-label="Transaktionstyp"
	onkeydown={onKeydown}
>
	{#each tabs as tab, i (tab.kind ?? 'all')}
		<button
			bind:this={tabEls[i]}
			role="tab"
			aria-selected={activeKind === tab.kind}
			tabindex={activeKind === tab.kind ? 0 : -1}
			onclick={() => onchange(tab.kind)}
			class={[
				'flex shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
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

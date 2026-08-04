<script lang="ts" module>
	import type { Snippet } from 'svelte';

	/**
	 * The ONE control geometry of a list toolbar (spec §3): 44px on mobile, 40px
	 * from md, `rounded-[10px]`, hairline on card. Every control in the row wears
	 * it — the mixed 44/40/36 heights were what made the old toolbar read as a
	 * pile of loose controls instead of one line.
	 */
	export const TOOLBAR_CONTROL =
		'h-11 min-h-11 rounded-[10px] border border-hairline bg-card px-3 text-sm text-ink-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-10 md:min-h-10';

	/**
	 * The row's single primary CTA is NOT defined here: it is the Kit
	 * `Button size="cta"` (h-11 md:h-10 rounded-[10px]), which matches this
	 * scale exactly. Guidelines §2.1 — never rebuild that geometry as a chain.
	 */

	/** TOOLBAR_CONTROL for things you click rather than type into. */
	export const TOOLBAR_BUTTON =
		`inline-flex items-center gap-1.5 whitespace-nowrap font-medium hover:bg-secondary ${TOOLBAR_CONTROL}`;


	export interface ListToolbarProps {
		/** Row 1, left: search, filter trigger, views — the controls that narrow the list. */
		leading: Snippet;
		/** Row 1, right: export + the one primary action. */
		actions?: Snippet;
		/** Row 1, right of the controls: the quiet result anchor. Only when filtered. */
		meta?: Snippet;
		/** Row 2: active-filter chips + the reset link. Never displaces row 1. */
		chips?: Snippet;
		/**
		 * Whether row 2 has anything to show. Kept separate from `chips` because a
		 * snippet is always "present" even when it would render nothing, and an
		 * empty chip row would still spend a gap under the toolbar.
		 */
		hasChips?: boolean;
		class?: string;
	}
</script>

<script lang="ts">
	/**
	 * ListToolbar — the ONE composed toolbar anatomy for list screens
	 * (Andys Regel 7, spec §3).
	 *
	 * Two rows, and the split is the whole point:
	 *
	 *   row 1  [search · filter · views] ————— ml-auto ————— [meta · export · primary]
	 *   row 2  [chip chip chip …  Zurücksetzen]
	 *
	 * Everything lives in ONE flex row, so every control shares one baseline and
	 * the right edge lines up with the list card below (`w-full` is what makes
	 * that true — a content-sized toolbar stops short of the card).
	 *
	 * The chip row is a SIBLING of row 1, not a wrapper around it, and the
	 * actions are IN the composition rather than in a neighbouring box. That is
	 * what keeps Δy of the action group at 0 when chips appear: previously the
	 * filter bar and the actions sat side by side in a vertically centred flex
	 * row, so a second chip line re-centred — and visibly nudged — the buttons.
	 *
	 * Heights are the caller's job but the contract is one scale: h-11 md:h-10
	 * on every control (spec §3, guidelines §1.5).
	 */
	let {
		leading,
		actions,
		meta,
		chips,
		hasChips = true,
		class: className
	}: ListToolbarProps = $props();
</script>

<div data-slot="list-toolbar" class={['flex w-full flex-col gap-2', className]}>
	<div data-slot="toolbar-row" class="flex w-full flex-wrap items-center gap-2">
		{@render leading()}

		{#if meta || actions}
			<div class="ml-auto flex flex-wrap items-center gap-2">
				{#if meta}
					<span
						data-slot="result-meta"
						aria-live="polite"
						aria-atomic="true"
						class="hidden whitespace-nowrap px-1 text-sm tabular-nums text-ink-500 md:inline"
					>
						{@render meta()}
					</span>
				{/if}
				{#if actions}{@render actions()}{/if}
			</div>
		{/if}
	</div>

	{#if chips && hasChips}
		<div data-slot="toolbar-chips" class="flex flex-wrap items-center gap-2">
			{@render chips()}
		</div>
	{/if}
</div>

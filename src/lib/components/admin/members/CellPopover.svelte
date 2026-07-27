<script lang="ts">
	/**
	 * CellPopover — the ONE anchored-surface shell for Beitrag cell dialogs
	 * (modal-member-popovers §4). A single controlled surface that presents its
	 * body as a bits-ui Popover anchored to the triggering cell on ≥ sm, and as a
	 * full-width bottom Sheet on < sm (the ~280px popover escapes a 390px viewport
	 * on the horizontal-scroll matrix; the sheet never does).
	 *
	 * This lifts the Popover/Sheet twin that MarkPaidControl and MemberMatrix each
	 * carried inline into one reusable wrapper, so every Beitrag surface (matrix,
	 * list, mobile card, detail timeline) shares identical anchor + focus-restore +
	 * mobile-sheet behaviour. It is a PURE shell: no POST, no domain knowledge —
	 * the caller supplies the body via `children` and owns every server action.
	 *
	 * Two open modes:
	 *  - controlled (default): the caller binds `open` and passes `anchor` (the
	 *    triggering element, e.g. `triggerEl` from BeitragCell.onOpenPopover). The
	 *    matrix uses this — it opens programmatically onto the active cell.
	 *  - trigger-snippet: pass a `trigger` snippet; bits-ui anchors + toggles it.
	 *    The list/card/detail surfaces use this (they render their own button).
	 *
	 * `onClose` fires after the surface finishes closing — wire it to restore focus
	 * to the triggering cell (the matrix's restoreTriggerFocus).
	 */
	import type { Snippet } from 'svelte';
	import { Popover } from 'bits-ui';
	import * as Sheet from '$lib/components/ui/sheet/index.js';

	let {
		open = $bindable(false),
		anchor = null,
		title,
		side = 'bottom',
		align = 'center',
		sideOffset = 6,
		onClose,
		popoverTestId = 'cell-popover',
		sheetTestId = 'cell-sheet',
		trigger,
		children
	}: {
		/** Controlled open state (bindable). */
		open?: boolean;
		/**
		 * Element the desktop popover anchors to (bits-ui `customAnchor`). Used in
		 * controlled mode; ignored when a `trigger` snippet is supplied. Typically
		 * the `triggerEl` emitted by BeitragCell.onOpenPopover.
		 */
		anchor?: HTMLElement | null;
		/**
		 * Accessible name for the mobile Sheet. bits-ui's Dialog warns without a
		 * Title, so this is required; it renders sr-only (the visible heading lives
		 * inside the body).
		 */
		title: string;
		side?: 'top' | 'right' | 'bottom' | 'left';
		align?: 'start' | 'center' | 'end';
		sideOffset?: number;
		/** Fires after the surface closes — restore focus to the trigger cell here. */
		onClose?: () => void;
		/** data-testid for the desktop Popover.Content. */
		popoverTestId?: string;
		/** data-testid for the mobile Sheet.Content. */
		sheetTestId?: string;
		/**
		 * Optional trigger element. When provided, `props` MUST be spread onto a
		 * focusable element so bits-ui can anchor + toggle it; `open` reflects state.
		 * Omit for controlled (anchor) mode.
		 */
		trigger?: Snippet<[{ props: Record<string, unknown>; open: boolean }]>;
		/** The dialog body (BeitragCellDialog or any content). */
		children: Snippet;
	} = $props();

	// Below Tailwind `sm` (640px) present a bottom Sheet instead of the anchored
	// popover. matchMedia is SSR-guarded and kept in sync via its change event.
	let isMobile = $state(false);
	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const mql = window.matchMedia('(max-width: 639px)');
		isMobile = mql.matches;
		const onChange = (e: MediaQueryListEvent) => (isMobile = e.matches);
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	});
</script>

{#if isMobile}
	<!-- Mobile (< sm): full-width bottom Sheet. Trigger (if any) renders inline. -->
	{#if trigger}
		{@render trigger({ props: { onclick: () => (open = true) }, open })}
	{/if}
	<Sheet.Root bind:open onOpenChangeComplete={(o) => { if (!o) onClose?.(); }}>
		<Sheet.Content
			side="bottom"
			class="rounded-t-2xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
			data-testid={sheetTestId}
		>
			<Sheet.Title class="sr-only">{title}</Sheet.Title>
			<div class="mx-auto w-full max-w-md py-2">
				{@render children()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else if trigger}
	<!-- Desktop (≥ sm), self-triggering: bits-ui anchors the popover to the trigger. -->
	<Popover.Root bind:open onOpenChangeComplete={(o) => { if (!o) onClose?.(); }}>
		<Popover.Trigger>
			{#snippet child({ props })}
				{@render trigger!({ props, open })}
			{/snippet}
		</Popover.Trigger>
		<Popover.Portal>
			<Popover.Content
				{side}
				{align}
				{sideOffset}
				class="z-50 rounded-lg border border-border bg-popover p-3 shadow-lg outline-none"
				data-testid={popoverTestId}
			>
				{@render children()}
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
{:else}
	<!-- Desktop (≥ sm), controlled: anchored to a caller-supplied element. -->
	<Popover.Root bind:open onOpenChangeComplete={(o) => { if (!o) onClose?.(); }}>
		<Popover.Portal>
			<Popover.Content
				customAnchor={anchor}
				{side}
				{align}
				{sideOffset}
				class="z-50 rounded-lg border border-border bg-popover p-3 shadow-lg outline-none"
				data-testid={popoverTestId}
			>
				{@render children()}
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
{/if}

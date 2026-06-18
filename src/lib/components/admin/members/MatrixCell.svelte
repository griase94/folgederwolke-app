<script lang="ts">
	/**
	 * MatrixCell — single (member, year) cell renderer.
	 *
	 * Task 2.2: Wraps BeitragsBadge with a `role="gridcell"` button, per-state
	 * aria-label, 44pt min tap target, data-state attribute (used by the
	 * auto-focus chain in MemberMatrix), and a state-aware click dispatcher.
	 *
	 * The cell does NOT open popovers itself — it dispatches an `open-popover`
	 * event with the popover kind so the parent (MemberMatrix) owns popover
	 * positioning + state. Locked-year clicks fire a `locked` event so the
	 * parent can surface a role="alert" toast (spec §7.11).
	 *
	 * Spec §7.2 (cell states) + §7.11 (interaction matrix) + §16 A2/B1.
	 */
	import BeitragsBadge from './BeitragsBadge.svelte';
	import { popoverKindForState, type CellState, type PopoverKind } from '$lib/domain/beitrag-cell.js';

	type OpenPopoverDetail = {
		kind: Exclude<PopoverKind, null>;
		memberId: string;
		year: number;
		triggerEl: HTMLElement;
	};

	let {
		state,
		isLocked = false,
		memberId,
		year,
		memberName = '',
		betragCents = 0,
		paidCents = 0,
		gezahltAm = null,
		exemptReason = null,
		daysOverdue = null,
		compact = false,
		onOpenPopover,
		onLocked
	}: {
		state: CellState;
		/** True when the year is covered by festgeschriebenBis — renders a lock decoration. */
		isLocked?: boolean;
		memberId: string;
		year: number;
		memberName?: string;
		betragCents?: number;
		paidCents?: number;
		gezahltAm?: string | null;
		exemptReason?: string | null;
		daysOverdue?: number | null;
		compact?: boolean;
		onOpenPopover?: (detail: OpenPopoverDetail) => void;
		onLocked?: (detail: { year: number }) => void;
	} = $props();

	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	/** Full aria-label per spec §7.2 (more descriptive than the badge's). */
	const ariaLabel = $derived.by(() => {
		const who = memberName ? `${memberName} ${year}` : `${year}`;
		const lockSuffix = isLocked ? ' (festgeschrieben)' : '';
		switch (state) {
			case 'paid':
				return `Bezahlt — ${who} — ${eur(paidCents)}${gezahltAm ? `, bezahlt am ${gezahltAm}` : ''}${lockSuffix}`;
			case 'partial':
				return `Teilweise bezahlt — ${who} — ${eur(paidCents)} von ${eur(betragCents)}${lockSuffix}`;
			case 'open':
				return `Offen — ${who} — ${eur(betragCents)} fällig${lockSuffix}`;
			case 'overdue':
				return `Überfällig — ${who} — ${eur(betragCents)} seit ${daysOverdue ?? 0} Tagen offen${lockSuffix}`;
			case 'exempt':
				return `Befreit — ${who} — ${exemptReason ?? ''}${lockSuffix}`;
			case 'permanently_exempt':
				return `Dauerhaft befreit (Ehrenmitglied) — ${who} — ${exemptReason ?? ''}`;
			case 'not_applicable_pre_join':
				return `Nicht zutreffend — ${memberName} war in ${year} noch nicht im Verein`;
			case 'not_applicable_post_austritt':
				return `Nicht zutreffend — ${memberName} ausgetreten`;
			case 'locked_year':
				return `Jahr ${year} festgeschrieben — keine Änderungen möglich`;
			default:
				return who;
		}
	});

	const interactive = $derived(
		state !== 'not_applicable_pre_join' && state !== 'not_applicable_post_austritt'
	);

	function trigger(el: HTMLElement) {
		if (!interactive) return;
		// Legacy locked_year state (e.g. from an optimistic overlay) → toast.
		if (state === 'locked_year') {
			onLocked?.({ year });
			return;
		}
		// Cells with isLocked=true carry the real underlying state; locked open/partial
		// cells fire onLocked so the parent can surface a "festgeschrieben" toast.
		// Locked paid/exempt cells still open the read-only info popover.
		if (isLocked) {
			const kind = popoverKindForState(state);
			if (kind === 'mark-paid') {
				// Open/partial/overdue locked → inform the user it's read-only.
				onLocked?.({ year });
				return;
			}
			if (kind !== null) {
				onOpenPopover?.({ kind, memberId, year, triggerEl: el });
			}
			return;
		}
		const kind = popoverKindForState(state);
		if (kind === null) return;
		onOpenPopover?.({ kind, memberId, year, triggerEl: el });
	}

	function handleClick(e: MouseEvent) {
		trigger(e.currentTarget as HTMLElement);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!interactive) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			trigger(e.currentTarget as HTMLElement);
		}
	}
</script>

<button
	type="button"
	role="gridcell"
	aria-label={ariaLabel}
	data-state={state}
	data-member-id={memberId}
	data-year={year}
	tabindex={interactive ? 0 : -1}
	disabled={!interactive}
	onclick={handleClick}
	onkeydown={handleKeydown}
	class="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 {interactive
		? 'cursor-pointer'
		: 'cursor-default'} disabled:cursor-default"
>
	<BeitragsBadge
		{state}
		{isLocked}
		{year}
		{betragCents}
		{paidCents}
		{gezahltAm}
		{exemptReason}
		{daysOverdue}
		{compact}
	/>
</button>

<script lang="ts">
	/**
	 * BeitragCell — the ONE canonical per-(member, year) Beitrags-Chipset.
	 *
	 * Consolidates the pre-Aurora trio (BeitragsBadge + BeitragStatusPill +
	 * MatrixCell) into a single `.bcell` component used by the Matrix grid, the
	 * Liste rows, the Mitglied-Detail Beitragsverlauf and the Mobil-Karten
	 * (flow-mitglieder §4). Always fed a `CellState` from the canonical
	 * `resolveBeitragState` — never re-derives state here.
	 *
	 * Two shells, one visual:
	 *   - variant="cell" → interactive `<button role="gridcell">` for the Matrix
	 *     (dispatches onOpenPopover / onLocked; the parent owns popover position).
	 *   - variant="pill" (default) → static `<span>` chip for lists/detail/cards.
	 *
	 * Aurora amber-discipline (flow-mitglieder red thread / §2 AC3):
	 *   paid → calm green · open + partial → --neutral-open (NEVER amber) ·
	 *   overdue → amber (severity-warn) · exempt/perm → slate · n/a → muted dash.
	 *   Text is the primary signal, the glyph is the reinforcer (WCAG 1.4.1); the
	 *   lock is a decoration over the honest underlying state, never a dead state.
	 */
	import {
		popoverKindForState,
		type CellState,
		type PopoverKind,
	} from '$lib/domain/beitrag-cell.js';
	import Check from '@lucide/svelte/icons/check';
	import Circle from '@lucide/svelte/icons/circle';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleDashed from '@lucide/svelte/icons/circle-dashed';
	import Ban from '@lucide/svelte/icons/ban';
	import Lock from '@lucide/svelte/icons/lock';

	type OpenPopoverDetail = {
		kind: Exclude<PopoverKind, null>;
		memberId: string;
		year: number;
		triggerEl: HTMLElement;
	};

	let {
		state,
		variant = 'pill',
		isLocked = false,
		memberId = '',
		year = 0,
		memberName = '',
		betragCents = 0,
		paidCents = 0,
		gezahltAm = null,
		exemptReason = null,
		daysOverdue = null,
		compact = false,
		onOpenPopover,
		onLocked,
		'data-testid': testId
	}: {
		state: CellState;
		variant?: 'cell' | 'pill';
		/** True when the year is festgeschrieben — renders a lock decoration. */
		isLocked?: boolean;
		memberId?: string;
		year?: number;
		memberName?: string;
		betragCents?: number;
		paidCents?: number;
		gezahltAm?: string | null;
		exemptReason?: string | null;
		daysOverdue?: number | null;
		/** Hide the text label, keeping icon + sr-only text (dense surfaces). */
		compact?: boolean;
		onOpenPopover?: (detail: OpenPopoverDetail) => void;
		onLocked?: (detail: { year: number }) => void;
		'data-testid'?: string;
	} = $props();

	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	/** Short one-word label per state (the primary signal). */
	const label = $derived.by(() => {
		switch (state) {
			case 'paid':
				return 'Bezahlt';
			case 'partial':
				return 'Teilzahlung';
			case 'open':
			case 'overdue':
				return 'Offen';
			case 'exempt':
			case 'permanently_exempt':
				return 'Befreit';
			default:
				return '—';
		}
	});

	/**
	 * Tone classes per state — Aurora tokens only, NO hardcoded hex. Amber
	 * (severity-warn) is reserved for overdue; open/partial carry the calm
	 * --neutral-open family so a merely-open Beitrag never reads as a warning.
	 */
	const toneClass = $derived.by(() => {
		switch (state) {
			case 'paid':
				return 'border-emerald-200 bg-emerald-50 text-emerald-800';
			case 'overdue':
				return 'border-severity-warn/30 bg-severity-warn/10 text-severity-warn-text';
			case 'open':
			case 'partial':
				return 'border-neutral-open/40 bg-neutral-open/12 text-open-ink';
			case 'exempt':
			case 'permanently_exempt':
			case 'locked_year':
				return 'border-hairline bg-ink-300/10 text-ink-500';
			default:
				// not_applicable_* → muted dash, no chrome
				return 'text-ink-300';
		}
	});

	const hasChrome = $derived(
		state !== 'not_applicable_pre_join' && state !== 'not_applicable_post_austritt'
	);

	/** Full descriptive aria-label (spec §7.2). */
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
				return `Befreit — ${who}${exemptReason ? ` — ${exemptReason}` : ''}${lockSuffix}`;
			case 'permanently_exempt':
				return `Dauerhaft befreit — ${who}${exemptReason ? ` — ${exemptReason}` : ''}`;
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

	// ── Matrix (variant="cell") interactive dispatch — inherited from MatrixCell.
	const interactive = $derived(variant === 'cell' && hasChrome);

	function trigger(el: HTMLElement) {
		if (!interactive) return;
		if (state === 'locked_year') {
			onLocked?.({ year });
			return;
		}
		if (isLocked) {
			const kind = popoverKindForState(state);
			if (kind === 'mark-paid') {
				onLocked?.({ year });
				return;
			}
			if (kind !== null) onOpenPopover?.({ kind, memberId, year, triggerEl: el });
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

<!-- Shared chip visual: glyph reinforcer + primary text label / fraction. -->
{#snippet inner()}
	{#if state === 'paid'}
		<Check size={13} aria-hidden="true" class="shrink-0" />
	{:else if state === 'overdue'}
		<CircleAlert size={13} aria-hidden="true" class="shrink-0" />
	{:else if state === 'partial'}
		<CircleDashed size={13} aria-hidden="true" class="shrink-0" />
	{:else if state === 'open'}
		<Circle size={13} aria-hidden="true" class="shrink-0" />
	{:else if state === 'exempt' || state === 'permanently_exempt'}
		<Ban size={13} aria-hidden="true" class="shrink-0" />
	{:else if state === 'locked_year'}
		<Lock size={13} aria-hidden="true" class="shrink-0" />
	{/if}
	{#if state === 'partial'}
		<span class="tabular-nums">{eur(paidCents)} / {eur(betragCents)}</span>
	{:else if hasChrome}
		{#if compact}
			<span class="sr-only">{label}</span>
		{:else}
			{label}
		{/if}
	{:else}
		—
	{/if}
	{#if isLocked && hasChrome}
		<Lock size={11} aria-hidden="true" class="ml-0.5 shrink-0 opacity-70" />
	{/if}
{/snippet}

{#if variant === 'cell'}
	<button
		type="button"
		role="gridcell"
		aria-label={ariaLabel}
		data-testid={testId ?? 'beitrag-cell'}
		data-state={state}
		data-locked={isLocked ? 'true' : undefined}
		data-member-id={memberId}
		data-year={year}
		tabindex={interactive ? 0 : -1}
		disabled={!interactive}
		onclick={handleClick}
		onkeydown={handleKeydown}
		class="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-default {toneClass} {hasChrome
			? ''
			: 'border-transparent'} {interactive ? 'cursor-pointer' : 'cursor-default'}"
	>
		{@render inner()}
	</button>
{:else}
	<span
		data-testid={testId ?? 'beitrag-status-pill'}
		data-state={state}
		data-locked={isLocked ? 'true' : undefined}
		aria-label={ariaLabel}
		class="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium {toneClass} {hasChrome
			? ''
			: 'border-transparent'}"
	>
		{@render inner()}
	</span>
{/if}

<script lang="ts">
	/**
	 * MarkPaidControl — the shared Beitrag mark-paid glue for the list
	 * (MemberRow), the mobile card (MemberCardMobile) and the detail-page timeline
	 * (MemberBeitragsTimeline). It owns the POST/undo/toast wiring so those three
	 * entry points behave identically, and delegates ALL presentation to the S1
	 * kit: the CellPopover shell (anchored Popover ≥sm / bottom Sheet <sm) wrapping
	 * a BeitragCellDialog in its `mark-paid` variant.
	 *
	 * Since C-S2 this is PURE POST/undo/toast glue around CellPopover +
	 * BeitragCellDialog — the former UI monolith (its own inline Popover/Sheet +
	 * MarkPaidPopover) is consolidated away, and NO variant/UI logic lives here any
	 * more. The brief §4 "delete MarkPaidControl" was ratified as a keep-as-glue
	 * deviation by the lead (dissolving it would triplicate the POST logic across
	 * row/card/detail); see the Aurora masterplan.
	 *
	 * The matrix does NOT use this — it owns an optimistic overlay and drives
	 * CellPopover + BeitragCellDialog directly. The server actions
	 * (?/mark-beitrag-paid, ?/set-beitrag-exempt, ?/send-reminder) are the single
	 * source of truth and stay untouched; this is a client wrapper that posts to
	 * them and reconciles via invalidateAll().
	 */
	import type { Snippet } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import CellPopover from './CellPopover.svelte';
	import BeitragCellDialog from './BeitragCellDialog.svelte';

	let {
		memberId,
		year,
		memberName,
		betragCents,
		paidCents = 0,
		notes = null,
		isOverdue = false,
		isLocked = false,
		allowExempt = true,
		open = $bindable(false),
		anchor = null,
		actionBase = '',
		onClose,
		trigger
	}: {
		memberId: string;
		year: number;
		memberName: string;
		betragCents: number;
		/** Already-paid cents — forwarded to BeitragCellDialog to prefill the total. */
		paidCents?: number;
		/** Existing payment note — forwarded so mark-paid preserves it on the
		 *  SET-semantics submit instead of clobbering it to null. */
		notes?: string | null;
		/**
		 * Gate the "Erinnerung senden" ghost inside the dialog. The list/card pass
		 * false; the detail timeline passes true for overdue years. The server
		 * (checkReminderAllowed + email check) stays the backstop.
		 */
		isOverdue?: boolean;
		isLocked?: boolean;
		/**
		 * Show the per-year "Befreien" affordance. Default true; the list
		 * (MemberRow), mobile card (MemberCardMobile) and detail timeline pass
		 * `false` because they don't reflect per-year exempt state — per-year
		 * Befreien stays matrix-only.
		 */
		allowExempt?: boolean;
		/** Controlled open state (e.g. MemberRow opens it programmatically). */
		open?: boolean;
		/** Element the desktop popover anchors to in controlled mode. */
		anchor?: HTMLElement | null;
		/**
		 * Route prefix for the form-action POSTs. The member DETAIL route only
		 * implements `mark-beitrag-paid` + `send-reminder`, so the timeline passes
		 * `actionBase="/app/mitglieder"` to reach the list route's full action set.
		 */
		actionBase?: string;
		/** Fired after the surface closes (e.g. to restore focus to the kebab). */
		onClose?: () => void;
		/** Optional trigger element (the card renders its own pay button). */
		trigger?: Snippet<[{ props: Record<string, unknown>; open: boolean }]>;
	} = $props();

	let submitting = $state(false);

	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	// Canonical POST → SvelteKit form action. A form-action fetch ALWAYS returns
	// HTTP 200 with a devalue-encoded ActionResult body, so `result.data.error`
	// must be decoded via `deserialize()` — hand-parsing res.json() silently drops
	// the server's message (the treasurer would never see the real Festschreibung /
	// 422-missing-Satz reason).
	async function post(
		action: string,
		fields: Record<string, string>
	): Promise<{ ok: boolean; error?: string }> {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.set(k, v);
		try {
			const res = await fetch(`${actionBase}?/${action}`, { method: 'POST', body: fd });
			const result = deserialize(await res.text());
			if (result.type === 'success') return { ok: true };
			if (result.type === 'failure') {
				return { ok: false, error: (result.data?.['error'] as string | undefined) ?? undefined };
			}
			return { ok: false };
		} catch {
			return { ok: false };
		}
	}

	function hapticSuccess() {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10);
	}
	function hapticError() {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([10, 40, 10]);
	}

	async function undoMarkPaid() {
		const result = await post('mark-beitrag-unpaid', { memberId, year: String(year) });
		if (!result.ok) {
			hapticError();
			toast.error(result.error ?? 'Rückgängig fehlgeschlagen.');
		}
		await invalidateAll();
	}

	async function undoExempt() {
		const result = await post('set-beitrag-exempt', {
			memberId,
			year: String(year),
			exempt: 'false'
		});
		if (!result.ok) {
			hapticError();
			toast.error(result.error ?? 'Rückgängig fehlgeschlagen.');
		}
		await invalidateAll();
	}

	async function handlePaid(detail: {
		memberId: string;
		year: number;
		gezahltAm: string;
		paidCents: number;
		notes: string | null;
	}) {
		if (submitting) return;
		submitting = true;
		open = false;
		try {
			const result = await post('mark-beitrag-paid', {
				memberId: detail.memberId,
				year: String(detail.year),
				gezahltAm: detail.gezahltAm,
				paidCents: String(detail.paidCents),
				notes: detail.notes ?? ''
			});
			if (!result.ok) {
				hapticError();
				toast.error(result.error ?? 'Fehler — Zahlung nicht gespeichert.');
				return;
			}
			hapticSuccess();
			await invalidateAll();
			const rest = betragCents - detail.paidCents;
			toast.success(
				rest > 0
					? `${eur(detail.paidCents)} erfasst — ${eur(rest)} noch offen`
					: `${memberName} ${detail.year} als bezahlt markiert`,
				{
					duration: 10000,
					action: { label: 'Rückgängig', onClick: () => undoMarkPaid() }
				}
			);
		} finally {
			submitting = false;
		}
	}

	async function handleExempt(detail: { memberId: string; year: number; reason: string }) {
		if (submitting) return;
		submitting = true;
		open = false;
		try {
			const result = await post('set-beitrag-exempt', {
				memberId: detail.memberId,
				year: String(detail.year),
				exempt: 'true',
				reason: detail.reason
			});
			if (!result.ok) {
				hapticError();
				toast.error(result.error ?? 'Fehler — Befreiung nicht gespeichert.');
				return;
			}
			hapticSuccess();
			await invalidateAll();
			toast.success(`${memberName} für ${detail.year} befreit (Grund: ${detail.reason})`, {
				duration: 10000,
				action: { label: 'Rückgängig', onClick: () => undoExempt() }
			});
		} finally {
			submitting = false;
		}
	}

	async function handleReminder(detail: { memberId: string; year: number }) {
		open = false;
		const result = await post('send-reminder', {
			memberId: detail.memberId,
			year: String(detail.year)
		});
		if (!result.ok) {
			toast.error(result.error ?? 'Erinnerung konnte nicht gesendet werden.');
			return;
		}
		toast.success(`Erinnerung an ${memberName} gesendet`);
	}

	const sheetTitle = $derived(`${memberName} · ${year} · Beitrag bearbeiten`);
</script>

<CellPopover
	bind:open
	{anchor}
	title={sheetTitle}
	{onClose}
	{trigger}
	popoverTestId="markpaid-popover"
	sheetTestId="markpaid-sheet"
>
	{#key `${memberId}:${year}`}
		<BeitragCellDialog
			{memberId}
			{year}
			{memberName}
			{betragCents}
			{paidCents}
			{notes}
			initialVariant="mark-paid"
			{isLocked}
			{allowExempt}
			canRemind={isOverdue}
			{submitting}
			onPaid={handlePaid}
			onExempt={handleExempt}
			onReminder={handleReminder}
		/>
	{/key}
</CellPopover>

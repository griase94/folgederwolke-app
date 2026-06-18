<script lang="ts">
	/**
	 * MemberMatrix — Beitragsmatrix (Task 2.7 rewire; PR3b optimistic + bottom-sheet).
	 *
	 * Renders the per-(member, year) grid via MatrixCell, driven by the
	 * server-computed MatrixData (Task 2.0 loader). A single controlled bits-ui
	 * Popover renders one of four variants (mark-paid / paid / exempt /
	 * permanently-exempt) anchored to the clicked cell. On viewports < sm the same
	 * variants render inside a full-width bottom Sheet instead (PR3b Task 3.2), so
	 * the ~280px popover never escapes a narrow phone viewport on the horizontal-
	 * scroll matrix. A ContextMenu wrapper (Task 2.3a) gives a right-click shortcut
	 * to bezahlt / befreien / Erinnerung.
	 *
	 * PR3b Task 3.1 — OPTIMISTIC mark-paid. The loaded `matrix` prop is NEVER
	 * mutated. Instead a client-side overlay (`optimistic`, keyed
	 * `${memberId}:${year}`) holds the just-applied cell state. When rendering a
	 * cell, the overlay value (if present) wins over the loaded value, so the grid
	 * flips in <16ms — synchronously, before any network round-trip. On SUCCESS we
	 * reconcile by re-fetching ONLY the matrix load (`invalidate(
	 * 'app:beitrags-matrix')`, scoped via depends() in +page.server.ts — NOT
	 * invalidateAll()) and then clear that overlay entry so the reconciled DB state
	 * shows through. On FAILURE (network error / !ok / 409 Festschreibung /
	 * ActionFailure) we DELETE the overlay entry — reverting the cell to its exact
	 * prior loaded state — fire an error haptic and toast the server error. A
	 * treasurer never sees "paid"/"befreit" persist when the server rejected it.
	 *
	 * The server action (members-actions.ts) is the single source of truth and is
	 * untouched by this PR — this is a client-side display optimisation only.
	 *
	 * ARIA: role="grid" / "row" / "gridcell" (§16 A2); year-headers carry an
	 * aria-label "X von Y bezahlt, Z Euro erhalten" (§16 B2).
	 */
	import { invalidate } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Popover, ContextMenu } from 'bits-ui';
	import { SvelteMap } from 'svelte/reactivity';
	import Lock from '@lucide/svelte/icons/lock';
	import Users from '@lucide/svelte/icons/users';
	import { EmptyState } from '$lib/components/ui/empty-state/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import MatrixCell from './MatrixCell.svelte';
	import MarkPaidPopover from './MarkPaidPopover.svelte';
	import PaidCellPopover from './PaidCellPopover.svelte';
	import ExemptCellPopover from './ExemptCellPopover.svelte';
	import PermanentExemptPopover from './PermanentExemptPopover.svelte';
	import type { MatrixData, MatrixCell as MatrixCellData, PopoverKind } from '$lib/domain/beitrag-cell.js';

	let {
		matrix,
		filter = null
	}: {
		matrix: MatrixData;
		/** ?filter=ueberfaellig|offen — highlights matching cells. */
		filter?: 'ueberfaellig' | 'offen' | null;
	} = $props();

	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	// Anchor (current) year sits in the middle of the [anchor-1, anchor, anchor+1]
	// window. Used to place the single exempt-chip testid on one column.
	const anchorIndex = $derived(Math.floor(matrix.headers.length / 2));

	// ── Cell lookup ────────────────────────────────────────────────────────────
	const cellMap = $derived.by(() => {
		const m = new SvelteMap<string, MatrixCellData>();
		for (const c of matrix.cells) m.set(`${c.memberId}:${c.year}`, c);
		return m;
	});

	// ── Optimistic overlay (PR3b Task 3.1) ──────────────────────────────────────
	// The loaded `matrix` is read-only; this overlay holds the just-applied cell
	// state, keyed `${memberId}:${year}`. Overlay wins over the loaded value when
	// rendering. Set synchronously on submit (instant flip), cleared after a
	// successful scoped reconcile, deleted (rolled back) on failure.
	const optimistic = new SvelteMap<string, MatrixCellData>();

	/** Effective cell = overlay (if present) wins over the loaded value. */
	function cellFor(memberId: string, year: number): MatrixCellData | undefined {
		const key = `${memberId}:${year}`;
		return optimistic.get(key) ?? cellMap.get(key);
	}

	function memberName(memberId: string): string {
		const mem = matrix.members.find((m) => m.id === memberId);
		return mem ? `${mem.vorname} ${mem.nachname}` : '';
	}

	// ── Popover / Sheet state (single controlled surface, anchored to the active
	//    cell on desktop, bottom-sheet on mobile) ────────────────────────────────
	let popoverOpen = $state(false);
	let popoverKind = $state<Exclude<PopoverKind, null>>('mark-paid');
	let activeMemberId = $state('');
	let activeYear = $state(0);
	let activeTrigger = $state<HTMLElement | null>(null);
	let initialMode = $state<'mark-paid' | 'befreien'>('mark-paid');
	let submitting = $state(false);

	// ── Mobile detection (PR3b Task 3.2) ─────────────────────────────────────────
	// Below `sm` (Tailwind sm = 640px) we present the mark-paid UI as a bottom
	// Sheet rather than the anchored ~280px popover. matchMedia is SSR-guarded and
	// kept in sync via its change event. No new dependency.
	let isMobile = $state(false);
	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const mql = window.matchMedia('(max-width: 639px)');
		isMobile = mql.matches;
		const onChange = (e: MediaQueryListEvent) => (isMobile = e.matches);
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	});

	// The active cell drives the popover/sheet content. It reads through the
	// overlay so a freshly-flipped cell never re-opens onto stale data.
	const activeCell = $derived(
		activeMemberId && activeYear ? cellFor(activeMemberId, activeYear) : undefined
	);
	const isLocked = $derived(
		matrix.festgeschriebenBis !== null && activeYear <= matrix.festgeschriebenBis
	);

	function openPopover(detail: {
		kind: Exclude<PopoverKind, null>;
		memberId: string;
		year: number;
		triggerEl: HTMLElement;
		mode?: 'mark-paid' | 'befreien';
	}) {
		popoverKind = detail.kind;
		activeMemberId = detail.memberId;
		activeYear = detail.year;
		activeTrigger = detail.triggerEl;
		initialMode = detail.mode ?? 'mark-paid';
		// Each open starts clean — never carry a stale suppress flag into a new
		// surface (it must only skip the ONE close-complete that follows a success).
		suppressTriggerRestore = false;
		popoverOpen = true;
	}

	function handleLocked(detail: { year: number }) {
		toast.error(`Jahr ${detail.year} festgeschrieben — Änderungen nicht möglich`);
	}

	// ── Auto-focus chain (silent) ───────────────────────────────────────────────
	// After a successful submit, hop focus to the next open/overdue cell. Reads
	// data-state from the DOM, which the overlay flips synchronously — so the
	// just-acted cell is already non-open and gets skipped.
	let gridEl = $state<HTMLElement | null>(null);

	function focusNextOpenCell() {
		if (!gridEl) return;
		const cells = Array.from(
			gridEl.querySelectorAll<HTMLButtonElement>('[role="gridcell"]')
		);
		const startIdx = cells.findIndex(
			(c) =>
				c.dataset.memberId === activeMemberId && Number(c.dataset.year) === activeYear
		);
		// Search forward from the cell after the one we just acted on.
		for (let i = startIdx + 1; i < cells.length; i++) {
			const s = cells[i]?.dataset.state;
			if (s === 'open' || s === 'overdue' || s === 'partial') {
				cells[i]?.focus();
				return;
			}
		}
		// Wrap to the beginning if nothing after.
		for (let i = 0; i <= startIdx && i < cells.length; i++) {
			const s = cells[i]?.dataset.state;
			if (s === 'open' || s === 'overdue' || s === 'partial') {
				cells[i]?.focus();
				return;
			}
		}
		// No open cell left — restore focus to the trigger.
		activeTrigger?.focus();
	}

	// PR3b #7: the surface's close-complete handler restores focus to the trigger
	// cell, but on a success path we instead want focusNextOpenCell() to win.
	// Because close-complete can fire AFTER the awaited reconcile (fast network),
	// a naive restore would yank focus back and defeat the auto-hop. This flag
	// makes them mutually exclusive: a successful paid/befreien sets it so the
	// next close-complete skips the restore (and resets the flag).
	let suppressTriggerRestore = $state(false);

	function restoreTriggerFocus() {
		// §16 E1: trigger-cell focus ring after popover close.
		if (suppressTriggerRestore) {
			suppressTriggerRestore = false;
			return;
		}
		activeTrigger?.focus();
	}

	// ── Haptic feedback (Task 3.2 / spec §16 J1) ─────────────────────────────
	// navigator.vibrate is not available on all browsers/devices. Always guard.
	function hapticSuccess() {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
			navigator.vibrate(10);
		}
	}

	// PR3b: distinct error pattern (short-long-short) so a rejected mutation feels
	// different from the success blip. Guarded for unsupported browsers.
	function hapticError() {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
			navigator.vibrate([10, 40, 10]);
		}
	}

	// ── Mutations ────────────────────────────────────────────────────────────────
	// A `fetch('?/action')` to a SvelteKit form action ALWAYS returns HTTP 200
	// (even for fail()/error), and the body is a devalue-encoded ActionResult —
	// `result.data` for a failure is a devalue STRING, not a plain object. So we
	// must decode with SvelteKit's canonical `deserialize()`; hand-parsing
	// `res.json().data.error` silently yields `undefined` in prod (the treasurer
	// would never see the real Festschreibung/§55 reason). The outer try/catch
	// maps a genuine transport/network failure to { ok: false }.
	async function post(
		action: string,
		fields: Record<string, string>
	): Promise<{ ok: boolean; error?: string }> {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.set(k, v);
		try {
			const res = await fetch(`?/${action}`, { method: 'POST', body: fd });
			const result = deserialize(await res.text());
			if (result.type === 'success') return { ok: true };
			if (result.type === 'failure') {
				return {
					ok: false,
					error: (result.data?.['error'] as string | undefined) ?? undefined
				};
			}
			// 'error' (an uncaught 500 / thrown error) or 'redirect' — no usable
			// per-field message; surface a generic failure so we still roll back.
			return { ok: false };
		} catch {
			return { ok: false };
		}
	}

	/**
	 * Reconcile the just-mutated cell from the server, then clear its overlay.
	 *
	 * Re-runs ONLY the matrix load (scoped `depends('app:beitrags-matrix')` in
	 * +page.server.ts) — NOT invalidateAll(), which would also re-fire the
	 * ~30-query dashboard. After the load resolves, `cellMap` reflects the DB, so
	 * dropping the overlay entry lets the reconciled value show through with no
	 * flicker (the overlay value and the new loaded value agree on success).
	 */
	async function reconcileAndClear(key: string) {
		await invalidate('app:beitrags-matrix');
		optimistic.delete(key);
	}

	/** Roll a cell back to its loaded state after a failed mutation. */
	function rollback(key: string) {
		optimistic.delete(key);
	}

	async function handlePaid(detail: { memberId: string; year: number; gezahltAm: string }) {
		const key = `${detail.memberId}:${detail.year}`;
		const prior = cellFor(detail.memberId, detail.year);
		const betragCents = prior?.betragCents ?? 0;

		// (a) Optimistic flip + haptic + close — SYNCHRONOUS, before any await so
		// the cell flips in <16ms independent of the network.
		optimistic.set(key, {
			memberId: detail.memberId,
			year: detail.year,
			state: 'paid',
			isLocked: false,
			betragCents,
			paidCents: betragCents,
			gezahltAm: detail.gezahltAm,
			exemptReason: null,
			daysOverdue: null
		});
		hapticSuccess();
		popoverOpen = false;
		// In-flight guard: disable submit buttons during the POST (double-submit
		// protection). Set AFTER the synchronous flip so the flip never waits on it;
		// cleared in finally regardless of outcome.
		submitting = true;

		try {
			// (b) POST in the background — the server stays the source of truth.
			const result = await post('mark-beitrag-paid', {
				memberId: detail.memberId,
				year: String(detail.year),
				gezahltAm: detail.gezahltAm
			});

			if (!result.ok) {
				// Roll back to the exact prior state — never persist a false "paid".
				rollback(key);
				hapticError();
				toast.error(result.error ?? 'Fehler — Zahlung nicht gespeichert.');
				return;
			}

			await reconcileAndClear(key);
			toast.success(`${memberName(detail.memberId)} ${detail.year} als bezahlt markiert`, {
				duration: 10000,
				action: {
					label: 'Rückgängig',
					onClick: () => undoMarkPaid(detail.memberId, detail.year)
				}
			});
			// Focus-hop AFTER reconcile so the re-rendered grid + toast are settled
			// (the cell already flipped synchronously via the overlay; this is the
			// §7.4 silent auto-focus nicety, not part of the <16ms flip). Suppress
			// the close-complete trigger-restore so it can't yank focus back (#7).
			suppressTriggerRestore = true;
			focusNextOpenCell();
		} finally {
			submitting = false;
		}
	}

	// ── Undo handlers (Rückgängig toast action) ──────────────────────────────────
	// Mirror the main handlers' result-check: surface the server error if the undo
	// itself fails, and reconcile regardless so the grid always shows the truth.
	async function undoMarkPaid(memberId: string, year: number) {
		const result = await post('mark-beitrag-unpaid', { memberId, year: String(year) });
		if (!result.ok) {
			hapticError();
			toast.error(result.error ?? 'Rückgängig fehlgeschlagen.');
		}
		await invalidate('app:beitrags-matrix');
	}

	async function undoExempt(memberId: string, year: number) {
		const result = await post('set-beitrag-exempt', {
			memberId,
			year: String(year),
			exempt: 'false'
		});
		if (!result.ok) {
			hapticError();
			toast.error(result.error ?? 'Rückgängig fehlgeschlagen.');
		}
		await invalidate('app:beitrags-matrix');
	}

	async function handleExempt(detail: { memberId: string; year: number; reason: string }) {
		const key = `${detail.memberId}:${detail.year}`;
		const prior = cellFor(detail.memberId, detail.year);

		optimistic.set(key, {
			memberId: detail.memberId,
			year: detail.year,
			state: 'exempt',
			isLocked: false,
			betragCents: prior?.betragCents ?? 0,
			paidCents: 0,
			gezahltAm: null,
			exemptReason: detail.reason,
			daysOverdue: null
		});
		hapticSuccess();
		popoverOpen = false;
		submitting = true;

		try {
			const result = await post('set-beitrag-exempt', {
				memberId: detail.memberId,
				year: String(detail.year),
				exempt: 'true',
				reason: detail.reason
			});

			if (!result.ok) {
				rollback(key);
				hapticError();
				toast.error(result.error ?? 'Fehler — Befreiung nicht gespeichert.');
				return;
			}

			await reconcileAndClear(key);
			toast.success(
				`${memberName(detail.memberId)} für ${detail.year} befreit (Grund: ${detail.reason})`,
				{
					duration: 10000,
					action: {
						label: 'Rückgängig',
						onClick: () => undoExempt(detail.memberId, detail.year)
					}
				}
			);
			// Focus-hop after reconcile (see handlePaid). Cell already flipped via
			// overlay. Suppress the close-complete trigger-restore (#7).
			suppressTriggerRestore = true;
			focusNextOpenCell();
		} finally {
			submitting = false;
		}
	}

	async function handleStorno(detail: { memberId: string; year: number }) {
		const key = `${detail.memberId}:${detail.year}`;
		const prior = cellFor(detail.memberId, detail.year);

		// Storno reverts a paid cell back to open (the loader derives overdue from
		// dates on the next reconcile; "open" is the safe optimistic placeholder).
		optimistic.set(key, {
			memberId: detail.memberId,
			year: detail.year,
			state: 'open',
			isLocked: false,
			betragCents: prior?.betragCents ?? 0,
			paidCents: 0,
			gezahltAm: null,
			exemptReason: null,
			daysOverdue: null
		});
		hapticSuccess();
		popoverOpen = false;
		submitting = true;

		try {
			const result = await post('mark-beitrag-unpaid', {
				memberId: detail.memberId,
				year: String(detail.year)
			});

			if (!result.ok) {
				rollback(key);
				hapticError();
				toast.error(result.error ?? 'Fehler — Storno nicht möglich.');
				return;
			}

			await reconcileAndClear(key);
			toast.success(`Zahlung ${memberName(detail.memberId)} ${detail.year} storniert`, {
				duration: 10000
			});
			restoreTriggerFocus();
		} finally {
			submitting = false;
		}
	}

	async function handleAufheben(detail: { memberId: string; year: number }) {
		const key = `${detail.memberId}:${detail.year}`;
		const prior = cellFor(detail.memberId, detail.year);

		optimistic.set(key, {
			memberId: detail.memberId,
			year: detail.year,
			state: 'open',
			isLocked: false,
			betragCents: prior?.betragCents ?? 0,
			paidCents: 0,
			gezahltAm: null,
			exemptReason: null,
			daysOverdue: null
		});
		hapticSuccess();
		popoverOpen = false;
		submitting = true;

		try {
			const result = await post('set-beitrag-exempt', {
				memberId: detail.memberId,
				year: String(detail.year),
				exempt: 'false'
			});

			if (!result.ok) {
				rollback(key);
				hapticError();
				toast.error(result.error ?? 'Fehler — Aufheben nicht möglich.');
				return;
			}

			await reconcileAndClear(key);
			toast.success(`Befreiung ${memberName(detail.memberId)} ${detail.year} aufgehoben`, {
				duration: 10000
			});
			restoreTriggerFocus();
		} finally {
			submitting = false;
		}
	}

	async function handleReminder(detail: { memberId: string; year: number }) {
		// Reminder is a side-effect mail, not a cell-state change — no overlay.
		const result = await post('send-reminder', {
			memberId: detail.memberId,
			year: String(detail.year)
		});
		if (!result.ok) {
			toast.error(result.error ?? 'Erinnerung konnte nicht gesendet werden.');
			return;
		}
		toast.success(`Erinnerung an ${memberName(detail.memberId)} gesendet`);
	}

	// ── Context-menu (right-click) shortcuts (Task 2.3a / §7.11) ─────────────────
	function ctxBezahlt(memberId: string, year: number, triggerEl: HTMLElement) {
		openPopover({ kind: 'mark-paid', memberId, year, triggerEl, mode: 'mark-paid' });
	}
	function ctxBefreien(memberId: string, year: number, triggerEl: HTMLElement) {
		openPopover({ kind: 'mark-paid', memberId, year, triggerEl, mode: 'befreien' });
	}

	// Header aria-label per §16 B2.
	function headerAria(h: MatrixData['headers'][0]): string {
		return `${h.paidCount} von ${h.totalDueCount} bezahlt, ${eur(h.paidSumCents)} erhalten`;
	}

	const isOverdueActive = $derived(activeCell?.state === 'overdue');

	// Accessible name for the mobile bottom Sheet (bits-ui Dialog requires a
	// Title; without one it warns and the dialog has no accessible name). One
	// label per variant, sr-only — the visible heading lives in the body content.
	const sheetTitle = $derived.by(() => {
		const who = activeMemberId ? `${memberName(activeMemberId)} · ${activeYear}` : '';
		switch (popoverKind) {
			case 'mark-paid':
				return `${who} · Beitrag bearbeiten`;
			case 'paid':
				return `${who} · Zahlung`;
			case 'exempt':
				return `${who} · Befreiung`;
			case 'permanently_exempt':
				return `${who} · Dauerhaft befreit`;
			default:
				return who;
		}
	});

	// Highlight class for the ?filter view.
	function filterHighlight(state: string): boolean {
		if (filter === 'ueberfaellig') return state === 'overdue';
		if (filter === 'offen') return state === 'open' || state === 'overdue' || state === 'partial';
		return false;
	}
</script>

{#snippet popoverBody()}
	{#if activeCell}
		{#if popoverKind === 'mark-paid'}
			<MarkPaidPopover
				memberId={activeMemberId}
				year={activeYear}
				memberName={memberName(activeMemberId)}
				betragCents={activeCell.betragCents}
				isOverdue={isOverdueActive}
				{isLocked}
				{initialMode}
				{submitting}
				onPaid={handlePaid}
				onExempt={handleExempt}
				onReminder={handleReminder}
				onCancel={() => (popoverOpen = false)}
			/>
		{:else if popoverKind === 'paid'}
			<PaidCellPopover
				memberId={activeMemberId}
				year={activeYear}
				memberName={memberName(activeMemberId)}
				betragCents={activeCell.betragCents}
				gezahltAm={activeCell.gezahltAm}
				{isLocked}
				{submitting}
				onStorno={handleStorno}
			/>
		{:else if popoverKind === 'exempt'}
			<ExemptCellPopover
				memberId={activeMemberId}
				year={activeYear}
				memberName={memberName(activeMemberId)}
				exemptReason={activeCell.exemptReason}
				{isLocked}
				{submitting}
				onAufheben={handleAufheben}
			/>
		{:else if popoverKind === 'permanently_exempt'}
			<PermanentExemptPopover
				memberId={activeMemberId}
				year={activeYear}
				memberName={memberName(activeMemberId)}
				exemptReason={activeCell.exemptReason}
			/>
		{/if}
	{/if}
{/snippet}

<div class="overflow-x-auto rounded-xl border border-border">
	{#if filter}
		<div
			class="border-b border-border bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
			role="status"
		>
			Gefiltert: {filter === 'ueberfaellig' ? 'überfällige' : 'offene'} Beiträge hervorgehoben
		</div>
	{/if}

	<!-- role=grid wrapper. Each member is a row; cells are gridcells. -->
	<div bind:this={gridEl} role="grid" aria-label="Beitragsmatrix" class="min-w-[500px]">
		<!-- Header row -->
		<div role="row" class="flex border-b border-border bg-muted/50">
			<div
				role="columnheader"
				class="sticky left-0 z-10 flex min-w-[160px] flex-1 items-center bg-muted/50 px-4 py-2.5 text-left text-sm font-semibold text-foreground"
			>
				Mitglied
			</div>
			{#each matrix.headers as h, hi (h.year)}
				<div
					role="columnheader"
					aria-label={headerAria(h)}
					class="flex min-w-[120px] flex-col items-center px-4 py-2.5 text-center"
				>
					<div class="flex items-center gap-1 text-sm font-semibold text-foreground">
						{h.year}
						{#if h.isLocked}
							<Lock size={12} class="text-muted-foreground" aria-label="Festgeschrieben" />
						{/if}
					</div>
					<div class="text-[11px] font-normal leading-tight text-muted-foreground tabular-nums">
						{h.paidCount}/{h.totalDueCount} bezahlt
					</div>
					<div class="text-[11px] font-normal leading-tight text-muted-foreground tabular-nums">
						{eur(h.paidSumCents)}
						{#if h.exemptCount > 0}
							<!-- Anchor (middle) column carries the testid so the exempt-chip
							     selector resolves to a single element across the 3-year window. -->
							<span data-testid={hi === anchorIndex ? 'matrix-header-exempt' : undefined}>
								· +{h.exemptCount} befreit
							</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Member rows -->
		{#if matrix.members.length === 0}
			<!-- aria-hidden on the decorative EmptyState inner elements; the row/gridcell
			     ARIA structure stays intact for assistive-technology grid navigation. -->
			<div role="row" class="flex">
				<div role="gridcell" class="flex-1 px-2 py-4">
					<EmptyState
						title="Noch keine Mitglieder"
						description="Füge das erste Mitglied hinzu, um Beiträge zu verwalten."
					>
						{#snippet icon()}
							<Users size={32} aria-hidden="true" />
						{/snippet}
					</EmptyState>
				</div>
			</div>
		{:else}
			{#each matrix.members as member (member.id)}
				<div
					role="row"
					class="flex border-b border-border transition-colors last:border-0 hover:bg-muted/20"
				>
					<div
						role="rowheader"
						class="sticky left-0 z-10 flex min-w-[160px] flex-1 items-center bg-card px-4 py-2.5"
					>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href="/app/mitglieder/{member.id}" class="text-sm font-medium text-foreground hover:text-primary {member.austrittsJahr !== null ? 'line-through decoration-muted-foreground/40' : ''}">
							{member.nachname}, {member.vorname}
						</a>
					</div>
					{#each matrix.years as year (year)}
						{@const cell = cellFor(member.id, year)}
						{@const state = cell?.state ?? 'open'}
						{@const canCtx = state === 'open' || state === 'overdue' || state === 'partial'}
						<div
							class="flex min-w-[120px] items-center justify-center px-4 py-2.5 {filterHighlight(
								state
							)
								? 'bg-amber-50/60 dark:bg-amber-950/20'
								: ''}"
						>
							{#if canCtx}
								<ContextMenu.Root>
									<ContextMenu.Trigger>
										<MatrixCell
											{state}
											isLocked={cell?.isLocked ?? false}
											memberId={member.id}
											{year}
											memberName={`${member.vorname} ${member.nachname}`}
											betragCents={cell?.betragCents ?? 0}
											paidCents={cell?.paidCents ?? 0}
											gezahltAm={cell?.gezahltAm ?? null}
											exemptReason={cell?.exemptReason ?? null}
											daysOverdue={cell?.daysOverdue ?? null}
											compact
											onOpenPopover={openPopover}
											onLocked={handleLocked}
										/>
									</ContextMenu.Trigger>
									<ContextMenu.Portal>
										<ContextMenu.Content
											class="z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md"
										>
											<ContextMenu.Item
												class="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
												onSelect={() => {
													const el = gridEl?.querySelector<HTMLElement>(
														`[data-member-id="${member.id}"][data-year="${year}"]`
													);
													if (el) ctxBezahlt(member.id, year, el);
												}}
											>
												Bezahlt
											</ContextMenu.Item>
											<ContextMenu.Item
												class="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
												onSelect={() => {
													const el = gridEl?.querySelector<HTMLElement>(
														`[data-member-id="${member.id}"][data-year="${year}"]`
													);
													if (el) ctxBefreien(member.id, year, el);
												}}
											>
												Befreien
											</ContextMenu.Item>
											{#if state === 'overdue'}
												<ContextMenu.Item
													class="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
													onSelect={() => handleReminder({ memberId: member.id, year })}
												>
													Erinnerung senden
												</ContextMenu.Item>
											{/if}
										</ContextMenu.Content>
									</ContextMenu.Portal>
								</ContextMenu.Root>
							{:else}
								<MatrixCell
									{state}
									isLocked={cell?.isLocked ?? false}
									memberId={member.id}
									{year}
									memberName={`${member.vorname} ${member.nachname}`}
									betragCents={cell?.betragCents ?? 0}
									paidCents={cell?.paidCents ?? 0}
									gezahltAm={cell?.gezahltAm ?? null}
									exemptReason={cell?.exemptReason ?? null}
									daysOverdue={cell?.daysOverdue ?? null}
									compact
									onOpenPopover={openPopover}
									onLocked={handleLocked}
								/>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		{/if}
	</div>
</div>

{#if isMobile}
	<!-- Mobile (< sm): full-width bottom Sheet. Same handlers/content as the
	     desktop popover — presentation only (PR3b Task 3.2). The anchored popover
	     can escape a 390px viewport on the horizontal-scroll matrix; the sheet
	     never does. -->
	<Sheet.Root bind:open={popoverOpen} onOpenChangeComplete={(o) => { if (!o) restoreTriggerFocus(); }}>
		<Sheet.Content
			side="bottom"
			class="rounded-t-2xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)]"
			data-testid="matrix-cell-sheet"
		>
			<!-- bits-ui Dialog requires a Title for an accessible name. sr-only so the
			     visible heading stays inside the variant body. -->
			<Sheet.Title class="sr-only">{sheetTitle}</Sheet.Title>
			<div class="mx-auto w-full max-w-md py-2">
				{@render popoverBody()}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<!-- Desktop (>= sm): single controlled popover, anchored to the active trigger cell. -->
	<Popover.Root bind:open={popoverOpen} onOpenChangeComplete={(o) => { if (!o) restoreTriggerFocus(); }}>
		<Popover.Portal>
			<Popover.Content
				customAnchor={activeTrigger}
				side="bottom"
				align="center"
				sideOffset={6}
				class="z-50 rounded-lg border border-border bg-popover p-3 shadow-lg outline-none"
			>
				{@render popoverBody()}
			</Popover.Content>
		</Popover.Portal>
	</Popover.Root>
{/if}

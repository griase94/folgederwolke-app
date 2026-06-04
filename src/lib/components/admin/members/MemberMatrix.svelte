<script lang="ts">
	/**
	 * MemberMatrix — Beitragsmatrix (Task 2.7 rewire).
	 *
	 * Renders the per-(member, year) grid via MatrixCell, driven by the
	 * server-computed MatrixData (Task 2.0 loader). A single controlled bits-ui
	 * Popover renders one of four variants (mark-paid / paid / exempt /
	 * permanently-exempt) anchored to the clicked cell. A ContextMenu wrapper
	 * (Task 2.3a) gives a right-click shortcut to bezahlt / befreien / Erinnerung.
	 *
	 * After a successful mutation the popover closes, data is invalidated, and
	 * focus silently hops to the next open/overdue cell (spec §7.4 auto-focus,
	 * no marathon chip). Locked-year cells fire a role="alert" toast.
	 *
	 * ARIA: role="grid" / "row" / "gridcell" (§16 A2); year-headers carry an
	 * aria-label "X von Y bezahlt, Z Euro erhalten" (§16 B2).
	 */
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Popover, ContextMenu } from 'bits-ui';
	import { SvelteMap } from 'svelte/reactivity';
	import Lock from '@lucide/svelte/icons/lock';
	import Users from '@lucide/svelte/icons/users';
	import { EmptyState } from '$lib/components/ui/empty-state/index.js';
	import MatrixCell from './MatrixCell.svelte';
	import MarkPaidPopover from './MarkPaidPopover.svelte';
	import PaidCellPopover from './PaidCellPopover.svelte';
	import ExemptCellPopover from './ExemptCellPopover.svelte';
	import PermanentExemptPopover from './PermanentExemptPopover.svelte';
	import type { MatrixData, PopoverKind } from '$lib/domain/beitrag-cell.js';

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
		const m = new SvelteMap<string, MatrixData['cells'][0]>();
		for (const c of matrix.cells) m.set(`${c.memberId}:${c.year}`, c);
		return m;
	});

	function cellFor(memberId: string, year: number) {
		return cellMap.get(`${memberId}:${year}`);
	}

	function memberName(memberId: string): string {
		const mem = matrix.members.find((m) => m.id === memberId);
		return mem ? `${mem.vorname} ${mem.nachname}` : '';
	}

	// ── Popover state (single controlled popover anchored to the active cell) ───
	let popoverOpen = $state(false);
	let popoverKind = $state<Exclude<PopoverKind, null>>('mark-paid');
	let activeMemberId = $state('');
	let activeYear = $state(0);
	let activeTrigger = $state<HTMLElement | null>(null);
	let initialMode = $state<'mark-paid' | 'befreien'>('mark-paid');
	let submitting = $state(false);

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
		popoverOpen = true;
	}

	function handleLocked(detail: { year: number }) {
		toast.error(`Jahr ${detail.year} festgeschrieben — Änderungen nicht möglich`);
	}

	// ── Auto-focus chain (silent) ───────────────────────────────────────────────
	// After a successful submit, hop focus to the next open/overdue cell.
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
			if (s === 'open' || s === 'overdue') {
				cells[i]?.focus();
				return;
			}
		}
		// Wrap to the beginning if nothing after.
		for (let i = 0; i <= startIdx && i < cells.length; i++) {
			const s = cells[i]?.dataset.state;
			if (s === 'open' || s === 'overdue') {
				cells[i]?.focus();
				return;
			}
		}
		// No open cell left — restore focus to the trigger.
		activeTrigger?.focus();
	}

	function restoreTriggerFocus() {
		// §16 E1: trigger-cell focus ring after popover close.
		activeTrigger?.focus();
	}

	// ── Haptic feedback (Task 3.2 / spec §16 J1) ─────────────────────────────
	// navigator.vibrate is not available on all browsers/devices. Always guard.
	function hapticSuccess() {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
			navigator.vibrate(10);
		}
	}

	// ── Mutations ────────────────────────────────────────────────────────────────
	async function post(
		action: string,
		fields: Record<string, string>
	): Promise<{ ok: boolean; error?: string }> {
		const fd = new FormData();
		for (const [k, v] of Object.entries(fields)) fd.set(k, v);
		try {
			const res = await fetch(`?/${action}`, { method: 'POST', body: fd });
			if (!res.ok) {
				try {
					const json = await res.json();
					// SvelteKit fail() responses: { type: "failure", data: { error: "..." } }
					return { ok: false, error: (json?.data?.error as string | undefined) ?? undefined };
				} catch {
					return { ok: false };
				}
			}
			const json = await res.json();
			// SvelteKit action responses: type "success" | "failure"
			if (json.type === 'success') return { ok: true };
			return { ok: false, error: (json?.data?.error as string | undefined) ?? undefined };
		} catch {
			return { ok: false };
		}
	}

	async function handlePaid(detail: { memberId: string; year: number; gezahltAm: string }) {
		submitting = true;
		const result = await post('mark-beitrag-paid', {
			memberId: detail.memberId,
			year: String(detail.year),
			gezahltAm: detail.gezahltAm
		});
		submitting = false;
		if (!result.ok) {
			toast.error(result.error ?? 'Fehler — Zahlung nicht gespeichert.');
			return;
		}
		popoverOpen = false;
		hapticSuccess();
		await invalidateAll();
		toast.success(`${memberName(detail.memberId)} ${detail.year} als bezahlt markiert`, {
			duration: 10000,
			action: {
				label: 'Rückgängig',
				onClick: async () => {
					await post('mark-beitrag-unpaid', {
						memberId: detail.memberId,
						year: String(detail.year)
					});
					await invalidateAll();
				}
			}
		});
		focusNextOpenCell();
	}

	async function handleExempt(detail: { memberId: string; year: number; reason: string }) {
		submitting = true;
		const result = await post('set-beitrag-exempt', {
			memberId: detail.memberId,
			year: String(detail.year),
			exempt: 'true',
			reason: detail.reason
		});
		submitting = false;
		if (!result.ok) {
			toast.error(result.error ?? 'Fehler — Befreiung nicht gespeichert.');
			return;
		}
		popoverOpen = false;
		hapticSuccess();
		await invalidateAll();
		toast.success(
			`${memberName(detail.memberId)} für ${detail.year} befreit (Grund: ${detail.reason})`,
			{
				duration: 10000,
				action: {
					label: 'Rückgängig',
					onClick: async () => {
						await post('set-beitrag-exempt', {
							memberId: detail.memberId,
							year: String(detail.year),
							exempt: 'false'
						});
						await invalidateAll();
					}
				}
			}
		);
		focusNextOpenCell();
	}

	async function handleStorno(detail: { memberId: string; year: number }) {
		submitting = true;
		const result = await post('mark-beitrag-unpaid', {
			memberId: detail.memberId,
			year: String(detail.year)
		});
		submitting = false;
		if (!result.ok) {
			toast.error(result.error ?? 'Fehler — Storno nicht möglich.');
			return;
		}
		popoverOpen = false;
		hapticSuccess();
		await invalidateAll();
		toast.success(`Zahlung ${memberName(detail.memberId)} ${detail.year} storniert`, {
			duration: 10000
		});
		restoreTriggerFocus();
	}

	async function handleAufheben(detail: { memberId: string; year: number }) {
		submitting = true;
		const result = await post('set-beitrag-exempt', {
			memberId: detail.memberId,
			year: String(detail.year),
			exempt: 'false'
		});
		submitting = false;
		if (!result.ok) {
			toast.error(result.error ?? 'Fehler — Aufheben nicht möglich.');
			return;
		}
		popoverOpen = false;
		hapticSuccess();
		await invalidateAll();
		toast.success(`Befreiung ${memberName(detail.memberId)} ${detail.year} aufgehoben`, {
			duration: 10000
		});
		restoreTriggerFocus();
	}

	async function handleReminder(detail: { memberId: string; year: number }) {
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

	// Highlight class for the ?filter view.
	function filterHighlight(state: string): boolean {
		if (filter === 'ueberfaellig') return state === 'overdue';
		if (filter === 'offen') return state === 'open' || state === 'overdue';
		return false;
	}
</script>

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
						{@const canCtx = state === 'open' || state === 'overdue'}
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

<!-- Single controlled popover, anchored to the active trigger cell. -->
<Popover.Root bind:open={popoverOpen} onOpenChangeComplete={(o) => { if (!o) restoreTriggerFocus(); }}>
	<Popover.Portal>
		<Popover.Content
			customAnchor={activeTrigger}
			side="bottom"
			align="center"
			sideOffset={6}
			class="z-50 rounded-lg border border-border bg-popover p-3 shadow-lg outline-none"
		>
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
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

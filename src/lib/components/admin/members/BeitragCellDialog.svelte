<script lang="ts">
	/**
	 * BeitragCellDialog — the ONE Beitrag cell dialog body (modal-member-popovers
	 * §1–§4). Consolidates the pre-Aurora quartet (MarkPaidPopover / PaidCellPopover
	 * / ExemptCellPopover / PermanentExemptPopover) into a single seven-variant
	 * state machine rendered *inside* CellPopover:
	 *
	 *   mark-paid    open/overdue/partial → Betrag + Bezahlt-am + Notiz + live
	 *                EÜR-line + „Bezahlt" (calm-green safe) + Befreien + Erinnerung.
	 *   edit         reached from paid-review „Bearbeiten"; same fields, seeded;
	 *                primary reads „Speichern".
	 *   befreien     reached from mark-paid „Befreien"; required Grund + „← Zurück".
	 *   paid-review  paid → ✓ status + Bezahlt-am + EÜR + Notiz; „Bearbeiten" +
	 *                „Stornieren" (two-step InlineConfirm — reverts to open).
	 *   exempt-review befreit → ⌀ status + Grund; „Aufheben" (InlineConfirm) with
	 *                the reassurance that the original Grund stays in the Verlauf.
	 *   perm-exempt  dauerhaft befreit → read-only Grund + Lock + „Mitglied öffnen".
	 *   readonly-mini „—" cells → plain-text reason + optional link (no dead ends).
	 *
	 * PURE presentation: it emits intents (onPaid/onExempt/onStorno/onAufheben/
	 * onReminder) and never POSTs, toasts, or mutates optimistic state — the screen
	 * (matrix, detail, list) owns the server actions, which stay untouched. The
	 * entry variant comes from `initialVariant` (parent maps it via
	 * `variantForKind(kind)` — never re-derives); the parent must key this component
	 * per open so its transient field/variant state starts fresh.
	 *
	 * C3a colour ruling: „Bezahlt" is the calm-green safe CTA (emerald, parity with
	 * BulkMarkBar), NEVER rosa. Destructive reverts are red two-step InlineConfirms.
	 */
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import DateField from '$lib/components/ui/date-field/DateField.svelte';
	import InlineConfirm from '$lib/components/ui/inline-confirm/InlineConfirm.svelte';
	import Check from '@lucide/svelte/icons/check';
	import Ban from '@lucide/svelte/icons/ban';
	import Lock from '@lucide/svelte/icons/lock';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { berlinYmd, berlinYear } from '$lib/domain/year.js';
	import { parseBetragCents } from '$lib/client/parse-betrag.js';
	import type { BeitragDialogVariant } from '$lib/domain/beitrag-cell.js';

	let {
		memberId,
		year,
		memberName,
		betragCents,
		paidCents = 0,
		gezahltAm = null,
		notes = null,
		exemptReason = null,
		initialVariant,
		isLocked = false,
		allowExempt = true,
		canRemind = false,
		submitting = false,
		miniReason = null,
		miniHref = null,
		miniLinkLabel = null,
		memberHref = null,
		onPaid,
		onExempt,
		onStorno,
		onAufheben,
		onReminder
	}: {
		memberId: string;
		year: number;
		memberName: string;
		/** Full obligation in integer cents. */
		betragCents: number;
		/** Already-paid cents — prefills the open remainder (mark-paid) or the
		 *  editable amount (edit). Default 0. */
		paidCents?: number;
		/** ISO YYYY-MM-DD — seeds paid-review / edit „Bezahlt am". */
		gezahltAm?: string | null;
		/** Existing Notiz — seeds edit + shown in paid-review. */
		notes?: string | null;
		/** Stored Befreiungs-Grund — shown in exempt-review / perm-exempt. */
		exemptReason?: string | null;
		/** The entry variant, mapped by the parent via `variantForKind(kind)`. */
		initialVariant: BeitragDialogVariant;
		/** Year is festgeschrieben — disables every commit + shows the lock alert. */
		isLocked?: boolean;
		/** Show the per-year „Befreien" affordance (matrix true; list/card/detail false). */
		allowExempt?: boolean;
		/** Show the „Erinnerung senden" ghost (parent: open balance AND member has
		 *  email AND checkReminderAllowed). */
		canRemind?: boolean;
		submitting?: boolean;
		/** readonly-mini: the plain-text reason („Kein Beitrag fällig — Eintritt 2024."). */
		miniReason?: string | null;
		/** readonly-mini: optional link target (e.g. Beitrags-Einstellungen for satz-fehlt). */
		miniHref?: string | null;
		/** readonly-mini: label for the optional link. */
		miniLinkLabel?: string | null;
		/** perm-exempt: „Mitglied öffnen" target. Defaults to /app/mitglieder/{memberId}. */
		memberHref?: string | null;
		onPaid?: (detail: {
			memberId: string;
			year: number;
			gezahltAm: string;
			paidCents: number;
			notes: string | null;
		}) => void;
		onExempt?: (detail: { memberId: string; year: number; reason: string }) => void;
		onStorno?: (detail: { memberId: string; year: number }) => void;
		onAufheben?: (detail: { memberId: string; year: number }) => void;
		onReminder?: (detail: { memberId: string; year: number }) => void;
	} = $props();

	// ── helpers ──────────────────────────────────────────────────────────────
	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	/** cents → plain de-DE decimal (6969 → "69,69") for prefilling the Betrag input. */
	function centsToDeDE(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	function formatDateDe(iso: string | null): string {
		if (!iso) return '—';
		const [y, m, d] = iso.split('-');
		return `${d}.${m}.${y}`;
	}

	// ── state (transient; parent keys the component per open) ──────────────────
	let variant = $state<BeitragDialogVariant>(untrack(() => initialVariant));

	// Prefill the Betrag input: mark-paid → open remainder; edit → the recorded amount.
	const seedCents = untrack(() =>
		initialVariant === 'edit' ? paidCents : Math.max(0, betragCents - paidCents)
	);

	let betragInput = $state(centsToDeDE(seedCents));
	let dateInput = $state(untrack(() => gezahltAm ?? berlinYmd()));
	let notizInput = $state(untrack(() => notes ?? ''));
	let reason = $state('');
	let showReasonError = $state(false);
	let betragInputEl = $state<HTMLInputElement | null>(null);
	let reasonInputEl = $state<HTMLInputElement | null>(null);

	// ── derived ────────────────────────────────────────────────────────────────
	const parsedCents = $derived(parseBetragCents(betragInput));
	const betragValid = $derived(
		!Number.isNaN(parsedCents) && parsedCents > 0 && parsedCents <= betragCents
	);

	// Live EÜR-Buchungsjahr from the chosen date (ADR-0001 Europe/Berlin). Pure UI
	// hint — Beiträge are synthesised into the EÜR from member_beitrags, not booked
	// as income rows, so there is no kategorie resolution here.
	const euerYear = $derived.by(() => {
		if (!dateInput) return berlinYear();
		const parsed = new Date(`${dateInput}T12:00:00`);
		return Number.isNaN(parsed.getTime()) ? berlinYear() : berlinYear(parsed);
	});
	// paid-review shows the booking year of the recorded payment date.
	const paidEuerYear = $derived.by(() => {
		if (!gezahltAm) return berlinYear();
		const parsed = new Date(`${gezahltAm}T12:00:00`);
		return Number.isNaN(parsed.getTime()) ? berlinYear() : berlinYear(parsed);
	});

	const reasonValid = $derived(reason.trim().length > 0);
	const titleId = $derived(`bcdlg-title-${memberId}-${year}`);
	const isEditing = $derived(variant === 'edit');
	const resolvedMemberHref = $derived(memberHref ?? `/app/mitglieder/${memberId}`);

	// Focus the primary field whenever the active variant changes (open + internal
	// transitions). queueMicrotask lets the switched markup mount first.
	$effect(() => {
		const v = variant;
		queueMicrotask(() => {
			if (v === 'mark-paid' || v === 'edit') betragInputEl?.focus();
			else if (v === 'befreien') reasonInputEl?.focus();
		});
	});

	// ── transitions + intents ────────────────────────────────────────────────
	function toBefreien() {
		if (submitting || isLocked) return;
		variant = 'befreien';
		showReasonError = false;
	}
	function toMarkPaid() {
		variant = 'mark-paid';
		reason = '';
		showReasonError = false;
	}
	function toEdit() {
		if (submitting || isLocked) return;
		// Seed the edit form from the recorded payment (the mount-time seed reflected
		// paid-review's zero remainder, not the amount being corrected).
		betragInput = centsToDeDE(paidCents > 0 ? paidCents : betragCents);
		dateInput = gezahltAm ?? berlinYmd();
		notizInput = notes ?? '';
		variant = 'edit';
	}
	function fillVollerBetrag() {
		betragInput = centsToDeDE(betragCents);
	}
	function setHeute() {
		dateInput = berlinYmd();
	}

	function submitPaid() {
		if (submitting || isLocked || !betragValid) return;
		onPaid?.({
			memberId,
			year,
			gezahltAm: dateInput,
			paidCents: parsedCents,
			notes: notizInput.trim() || null
		});
	}
	function submitExempt() {
		if (submitting || isLocked) return;
		if (!reasonValid) {
			showReasonError = true;
			reasonInputEl?.focus();
			return;
		}
		onExempt?.({ memberId, year, reason: reason.trim() });
	}

	function handleBetragKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			submitPaid();
		}
	}
	function handleReasonKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			submitExempt();
		}
	}

	const isPayForm = $derived(variant === 'mark-paid' || variant === 'edit');
</script>

<div
	role="dialog"
	aria-labelledby={titleId}
	aria-modal="false"
	class="flex max-w-[280px] flex-col gap-3 p-1"
	data-testid="beitrag-cell-dialog"
	data-variant={variant}
>
	{#if isPayForm}
		<!-- ── mark-paid / edit ─────────────────────────────────────────────── -->
		<h2 id={titleId} class="text-sm font-semibold text-foreground tabular-nums">
			{memberName} · {year} · {eur(betragCents)}
		</h2>

		<div class="flex flex-col gap-1.5">
			<label class="text-xs font-medium text-muted-foreground" for={`bcdlg-betrag-${memberId}-${year}`}
				>Betrag (€)</label
			>
			<div class="flex items-center gap-2">
				<input
					id={`bcdlg-betrag-${memberId}-${year}`}
					bind:this={betragInputEl}
					type="text"
					inputmode="decimal"
					bind:value={betragInput}
					onkeydown={handleBetragKeydown}
					disabled={isLocked || submitting}
					aria-invalid={!betragValid || undefined}
					data-testid="beitrag-dialog-betrag"
					class="min-h-[44px] flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive disabled:opacity-50 dark:bg-input/30"
				/>
				<button
					type="button"
					onclick={fillVollerBetrag}
					disabled={isLocked || submitting}
					class="min-h-[44px] rounded-md border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
				>
					Voller Betrag
				</button>
			</div>
		</div>

		<div class="flex flex-col gap-1.5">
			<label class="text-xs font-medium text-muted-foreground" for={`bcdlg-date-${memberId}-${year}`}
				>Bezahlt am</label
			>
			<div class="flex items-center gap-2">
				<div class="min-h-[44px] flex-1">
					<DateField
						id={`bcdlg-date-${memberId}-${year}`}
						name={`bcdlg-date-${memberId}-${year}`}
						value={dateInput}
						disabled={isLocked || submitting}
						onchange={(iso) => (dateInput = iso)}
						class="min-h-[44px] w-full"
					/>
				</div>
				<button
					type="button"
					onclick={setHeute}
					disabled={isLocked || submitting}
					class="min-h-[44px] rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
				>
					Heute
				</button>
			</div>
		</div>

		<div class="flex flex-col gap-1.5">
			<label class="text-xs font-medium text-muted-foreground" for={`bcdlg-notiz-${memberId}-${year}`}
				>Notiz (optional)</label
			>
			<input
				id={`bcdlg-notiz-${memberId}-${year}`}
				type="text"
				maxlength="200"
				bind:value={notizInput}
				disabled={isLocked || submitting}
				placeholder="z.B. Bar, Überweisung"
				class="min-h-[44px] rounded-md border border-border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:bg-input/30"
			/>
		</div>

		<p
			class="text-xs text-muted-foreground tabular-nums"
			aria-live="polite"
			aria-atomic="true"
			data-testid="beitrag-dialog-euer"
		>
			→ Wird in der EÜR {euerYear} als Einnahme verbucht
		</p>

		{#if canRemind && variant === 'mark-paid'}
			<button
				type="button"
				onclick={() => onReminder?.({ memberId, year })}
				disabled={submitting}
				data-testid="beitrag-dialog-remind"
				class="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
			>
				Erinnerung senden
			</button>
		{/if}

		{#if isLocked}
			<p role="alert" class="text-xs text-destructive" data-testid="beitrag-dialog-locked">
				Jahr {year} ist festgeschrieben — keine Änderungen möglich.
			</p>
		{/if}

		<div
			class="flex items-center gap-2 {allowExempt && variant === 'mark-paid'
				? 'justify-between'
				: 'justify-end'}"
		>
			{#if allowExempt && variant === 'mark-paid'}
				<Button
					variant="ghost"
					class="min-h-[44px]"
					onclick={toBefreien}
					disabled={submitting || isLocked}
					data-testid="beitrag-dialog-befreien"
				>
					Befreien
				</Button>
			{/if}
			<Button
				class="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
				onclick={submitPaid}
				disabled={submitting || isLocked || !betragValid}
				data-testid="beitrag-dialog-submit"
			>
				{isEditing ? 'Speichern ↵' : 'Bezahlt ↵'}
			</Button>
		</div>
	{:else if variant === 'befreien'}
		<!-- ── befreien ─────────────────────────────────────────────────────── -->
		<h2 id={titleId} class="text-sm font-semibold text-foreground">
			{memberName} · {year} · Befreien
		</h2>

		<div class="flex flex-col gap-1.5">
			<label class="text-xs font-medium text-muted-foreground" for={`bcdlg-grund-${memberId}-${year}`}
				>Grund (erforderlich)</label
			>
			<input
				id={`bcdlg-grund-${memberId}-${year}`}
				bind:this={reasonInputEl}
				bind:value={reason}
				type="text"
				maxlength="200"
				required
				aria-required="true"
				aria-invalid={(showReasonError && !reasonValid) || undefined}
				aria-describedby={`bcdlg-grund-help-${memberId}-${year}`}
				placeholder="z.B. Härtefall, Elternzeit"
				onkeydown={handleReasonKeydown}
				oninput={() => (showReasonError = false)}
				disabled={submitting || isLocked}
				data-testid="beitrag-dialog-grund"
				class="min-h-[44px] rounded-md border border-border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive disabled:opacity-50 dark:bg-input/30"
			/>
			<p id={`bcdlg-grund-help-${memberId}-${year}`} class="text-[11px] text-muted-foreground">
				Wird im Vereins-Protokoll referenziert
			</p>
			{#if showReasonError && !reasonValid}
				<p role="alert" class="text-xs text-destructive">Bitte einen Grund angeben.</p>
			{/if}
		</div>

		{#if isLocked}
			<p role="alert" class="text-xs text-destructive" data-testid="beitrag-dialog-locked">
				Jahr {year} ist festgeschrieben — keine Änderungen möglich.
			</p>
		{/if}

		<div class="flex items-center justify-between gap-2">
			<Button
				variant="ghost"
				class="min-h-[44px]"
				onclick={toMarkPaid}
				disabled={submitting}
				data-testid="beitrag-dialog-back"
			>
				← Zurück
			</Button>
			<Button
				class="min-h-[44px] bg-emerald-600 text-white hover:bg-emerald-700"
				onclick={submitExempt}
				disabled={!reasonValid || submitting || isLocked}
				data-testid="beitrag-dialog-befreien-commit"
			>
				Befreien ↵
			</Button>
		</div>
	{:else if variant === 'paid-review'}
		<!-- ── paid-review ──────────────────────────────────────────────────── -->
		<h2
			id={titleId}
			class="flex items-center gap-1.5 text-sm font-semibold text-foreground tabular-nums"
		>
			<Check size={14} class="shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
			{memberName} · {year} · {eur(paidCents > 0 ? paidCents : betragCents)}
		</h2>
		<p class="text-xs text-muted-foreground tabular-nums">
			Bezahlt am {formatDateDe(gezahltAm)}
		</p>
		<p class="text-xs text-muted-foreground tabular-nums" data-testid="beitrag-dialog-euer">
			EÜR-Buchung {paidEuerYear}
		</p>
		{#if notes}
			<p class="text-xs text-muted-foreground">Notiz: {notes}</p>
		{/if}

		{#if isLocked}
			<p role="alert" class="text-xs text-destructive" data-testid="beitrag-dialog-locked">
				Jahr {year} ist festgeschrieben — Storno nicht möglich.
			</p>
		{/if}

		<div class="flex items-center justify-between gap-2">
			<Button
				variant="ghost"
				class="min-h-9"
				onclick={toEdit}
				disabled={submitting || isLocked}
				data-testid="beitrag-dialog-edit"
			>
				Bearbeiten
			</Button>
			<InlineConfirm
				label="Stornieren"
				disabled={submitting || isLocked}
				onConfirm={() => onStorno?.({ memberId, year })}
				data-testid="beitrag-dialog-storno"
			/>
		</div>
	{:else if variant === 'exempt-review'}
		<!-- ── exempt-review ────────────────────────────────────────────────── -->
		<h2
			id={titleId}
			class="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400"
		>
			<Ban size={14} class="shrink-0" aria-hidden="true" />
			{memberName} · {year} · BEFREIT
		</h2>
		<p class="text-sm text-foreground">Grund: {exemptReason ?? '—'}</p>
		<p class="text-[11px] text-muted-foreground">Der ursprüngliche Grund bleibt im Verlauf.</p>

		{#if isLocked}
			<p role="alert" class="text-xs text-destructive" data-testid="beitrag-dialog-locked">
				Jahr {year} ist festgeschrieben — Aufheben nicht möglich.
			</p>
		{/if}

		<div class="flex justify-end">
			<InlineConfirm
				label="Aufheben"
				disabled={submitting || isLocked}
				onConfirm={() => onAufheben?.({ memberId, year })}
				data-testid="beitrag-dialog-aufheben"
			/>
		</div>
	{:else if variant === 'perm-exempt'}
		<!-- ── perm-exempt (read-only) ──────────────────────────────────────── -->
		<h2
			id={titleId}
			class="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400"
		>
			<Ban size={14} class="shrink-0" aria-hidden="true" />
			<Lock size={12} class="shrink-0 text-slate-500" aria-hidden="true" />
			{memberName} · DAUERHAFT BEFREIT
		</h2>
		<p class="text-sm text-foreground">Grund: {exemptReason ?? '—'}</p>

		<div class="flex justify-end">
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<Button
				variant="outline"
				size="sm"
				href={resolvedMemberHref}
				data-testid="beitrag-dialog-open-member"
			>
				Mitglied öffnen
				<ArrowRight size={14} aria-hidden="true" />
			</Button>
		</div>
	{:else}
		<!-- ── readonly-mini ("—" cells: pre_join / post_austritt / satz-fehlt) ── -->
		<p id={titleId} class="text-sm text-foreground" data-testid="beitrag-dialog-mini">
			{miniReason ?? 'Kein Beitrag fällig.'}
		</p>
		{#if miniHref}
			<div class="flex justify-end">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<Button variant="outline" size="sm" href={miniHref} data-testid="beitrag-dialog-mini-link">
					{miniLinkLabel ?? 'Öffnen'}
					<ArrowRight size={14} aria-hidden="true" />
				</Button>
			</div>
		{/if}
	{/if}
</div>

<script lang="ts">
	/**
	 * MarkPaidPopover — THE core Beitrag flow (spec §7.4 + §7.7 + Package E).
	 *
	 * Three in-place modes:
	 *  - "mark-paid": Betrag (de-DE, prefilled to open remainder) + Notiz (optional)
	 *    + date + "Heute" chip + "Voller Betrag" chip + live EÜR-Buchung line
	 *    + Bezahlt (rosa primary) + Befreien (ghost).
	 *    For overdue cells an extra "Erinnerung senden" button appears (§7.6).
	 *  - "edit": same fields but pre-seeded from initialGezahltAm/initialNotes/paidCents;
	 *    primary button reads "Speichern".
	 *  - "befreien": required Grund input (submit disabled until non-empty) +
	 *    "← Zurück" (restores mark-paid mode, preserves gezahltAm) + Befreien.
	 *
	 * onPaid emits { memberId, year, gezahltAm, paidCents, notes }.
	 * Money is rosa for the primary CTA (NEVER emerald). Enter submits, Esc
	 * cancels (handled by parent's Popover). 44pt targets. Dark-mode classes.
	 */
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { berlinYmd, berlinYear } from '$lib/domain/year.js';

	type Mode = 'mark-paid' | 'edit' | 'befreien';

	let {
		memberId,
		year,
		memberName,
		betragCents,
		paidCents = 0,
		isOverdue = false,
		isLocked = false,
		allowExempt = true,
		initialMode = 'mark-paid',
		initialGezahltAm,
		initialNotes = '',
		submitting = false,
		onPaid,
		onExempt,
		onReminder
	}: {
		memberId: string;
		year: number;
		memberName: string;
		/** Full obligation in integer cents. */
		betragCents: number;
		/** Already-paid cents (used to prefill the open remainder). Default 0. */
		paidCents?: number;
		isOverdue?: boolean;
		isLocked?: boolean;
		/**
		 * Show the "Befreien" (per-year Befreiung) affordance. Default true (the
		 * matrix, which DOES reflect per-year exempt state). The list/card/timeline
		 * surfaces pass `allowExempt={false}` to hide it.
		 */
		allowExempt?: boolean;
		initialMode?: Mode;
		/** Pre-seed the date input (edit mode). */
		initialGezahltAm?: string;
		/** Pre-seed the Notiz input (edit mode). */
		initialNotes?: string;
		submitting?: boolean;
		onPaid?: (detail: {
			memberId: string;
			year: number;
			gezahltAm: string;
			paidCents: number;
			notes: string | null;
		}) => void;
		onExempt?: (detail: { memberId: string; year: number; reason: string }) => void;
		onReminder?: (detail: { memberId: string; year: number }) => void;
		/** Reserved for explicit cancel wiring; bits-ui Popover handles Esc/outside. */
		onCancel?: () => void;
	} = $props();

	// ── helpers ──────────────────────────────────────────────────────────────
	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	/** Format cents as a plain de-DE decimal string without the currency symbol,
	 *  e.g. 6969 → "69,69". Used to prefill the Betrag text input. */
	function centsToDeDE(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	/** Parse a de-DE decimal string (e.g. "69,69" or "69.69") to integer cents.
	 *  Returns NaN when the input cannot be parsed. */
	function parseCents(raw: string): number {
		// Normalise: remove thousands separators (period), replace comma decimal with dot
		const normalised = raw.trim().replace(/\./g, '').replace(',', '.');
		const val = parseFloat(normalised);
		if (!isFinite(val) || val < 0) return NaN;
		return Math.round(val * 100);
	}

	// ── state ─────────────────────────────────────────────────────────────────
	// Initialise mode from the prop's first value; subsequent mode changes are
	// driven by the in-popover transform buttons. untrack makes the capture-once
	// intent explicit (silences state_referenced_locally).
	let mode = $state<Mode>(untrack(() => initialMode));

	// Open remainder (default for mark-paid). In edit mode seed from paidCents.
	const openRemainder = untrack(() =>
		initialMode === 'edit' ? paidCents : Math.max(0, betragCents - paidCents)
	);

	let betragInput = $state(centsToDeDE(openRemainder));
	let gezahltAm = $state(untrack(() => initialGezahltAm ?? berlinYmd()));
	let notizInput = $state(untrack(() => initialNotes ?? ''));
	let reason = $state('');
	let showReasonError = $state(false);
	let reasonInputEl = $state<HTMLInputElement | null>(null);

	// ── derived ───────────────────────────────────────────────────────────────
	// Parsed paidCents from the Betrag text input (NaN when invalid).
	const parsedCents = $derived(parseCents(betragInput));
	const betragValid = $derived(!isNaN(parsedCents) && parsedCents > 0 && parsedCents <= betragCents);

	// Live EÜR-Buchungsjahr — derived from the chosen date (ADR-0001 Berlin year).
	const euerYear = $derived.by(() => {
		if (!gezahltAm) return berlinYear();
		const parsed = new Date(`${gezahltAm}T12:00:00`);
		return Number.isNaN(parsed.getTime()) ? berlinYear() : berlinYear(parsed);
	});

	const reasonValid = $derived(reason.trim().length > 0);
	const titleId = $derived(`markpaid-title-${memberId}-${year}`);
	const isPrimary = $derived(mode === 'edit');

	// ── handlers ──────────────────────────────────────────────────────────────
	function toBefreien() {
		mode = 'befreien';
		showReasonError = false;
		queueMicrotask(() => reasonInputEl?.focus());
	}

	function toMarkPaid() {
		mode = 'mark-paid';
		reason = '';
		showReasonError = false;
	}

	function fillVollerBetrag() {
		betragInput = centsToDeDE(betragCents);
	}

	function submitPaid() {
		if (submitting || isLocked) return;
		const cents = parseCents(betragInput);
		if (isNaN(cents) || cents <= 0 || cents > betragCents) return;
		onPaid?.({
			memberId,
			year,
			gezahltAm,
			paidCents: cents,
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

	function handleReasonKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			submitExempt();
		}
	}

	function handleDateKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			submitPaid();
		}
	}

	function handleBetragKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			submitPaid();
		}
	}
</script>

<div
	role="dialog"
	aria-labelledby={titleId}
	aria-modal="false"
	class="flex max-w-[280px] flex-col gap-3 p-1"
	data-mode={mode}
>
	{#if mode === 'mark-paid' || mode === 'edit'}
		<h2 id={titleId} class="text-sm font-semibold text-foreground tabular-nums">
			{memberName} · {year} · {eur(betragCents)}
		</h2>

		<!-- Betrag field (Package E) -->
		<div class="flex flex-col gap-1.5">
			<label class="text-xs font-medium text-muted-foreground" for={`betrag-${memberId}-${year}`}
				>Betrag (€)</label
			>
			<div class="flex items-center gap-2">
				<input
					id={`betrag-${memberId}-${year}`}
					type="text"
					inputmode="decimal"
					bind:value={betragInput}
					onkeydown={handleBetragKeydown}
					disabled={isLocked || submitting}
					class="min-h-[44px] flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:bg-input/30"
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

		<!-- Bezahlt am field -->
		<div class="flex flex-col gap-1.5">
			<label
				class="text-xs font-medium text-muted-foreground"
				for={`gezahlt-am-${memberId}-${year}`}>Bezahlt am</label
			>
			<div class="flex items-center gap-2">
				<input
					id={`gezahlt-am-${memberId}-${year}`}
					type="date"
					lang="de"
					bind:value={gezahltAm}
					onkeydown={handleDateKeydown}
					disabled={isLocked || submitting}
					class="min-h-[44px] flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:bg-input/30"
				/>
				<button
					type="button"
					onclick={() => (gezahltAm = berlinYmd())}
					disabled={isLocked || submitting}
					class="min-h-[44px] rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
				>
					Heute
				</button>
			</div>
		</div>

		<!-- Notiz field (Package E) -->
		<div class="flex flex-col gap-1.5">
			<label class="text-xs font-medium text-muted-foreground" for={`notiz-${memberId}-${year}`}
				>Notiz (optional)</label
			>
			<input
				id={`notiz-${memberId}-${year}`}
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
		>
			→ Wird in der EÜR {euerYear} als Einnahme verbucht
		</p>

		{#if isOverdue && mode !== 'edit'}
			<button
				type="button"
				onclick={() => onReminder?.({ memberId, year })}
				disabled={submitting}
				class="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
			>
				Erinnerung senden
			</button>
		{/if}

		{#if isLocked}
			<p role="alert" class="text-xs text-destructive">
				Jahr {year} ist festgeschrieben — keine Änderungen möglich.
			</p>
		{/if}

		<div class="flex items-center {allowExempt && mode !== 'edit' ? 'justify-between' : 'justify-end'} gap-2">
			{#if allowExempt && mode !== 'edit'}
				<Button
					variant="ghost"
					class="min-h-[44px]"
					onclick={toBefreien}
					disabled={submitting || isLocked}
				>
					Befreien
				</Button>
			{/if}
			<Button
				class="min-h-[44px]"
				onclick={submitPaid}
				disabled={submitting || isLocked || !betragValid}
			>
				{isPrimary ? 'Speichern ↵' : 'Bezahlt ↵'}
			</Button>
		</div>
	{:else}
		<h2 id={titleId} class="text-sm font-semibold text-foreground">
			{memberName} · {year} · Befreien
		</h2>

		<div class="flex flex-col gap-1.5">
			<label
				class="text-xs font-medium text-muted-foreground"
				for={`grund-${memberId}-${year}`}>Grund (erforderlich)</label
			>
			<input
				id={`grund-${memberId}-${year}`}
				bind:this={reasonInputEl}
				bind:value={reason}
				type="text"
				maxlength="200"
				required
				aria-required="true"
				aria-invalid={showReasonError && !reasonValid}
				aria-describedby={`grund-help-${memberId}-${year}`}
				placeholder="z.B. Härtefall, Elternzeit"
				onkeydown={handleReasonKeydown}
				oninput={() => (showReasonError = false)}
				disabled={submitting}
				class="min-h-[44px] rounded-md border border-border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive disabled:opacity-50 dark:bg-input/30"
			/>
			<p id={`grund-help-${memberId}-${year}`} class="text-[11px] text-muted-foreground">
				Wird im Vereins-Protokoll referenziert
			</p>
			{#if showReasonError && !reasonValid}
				<p role="alert" class="text-xs text-destructive">Bitte einen Grund angeben.</p>
			{/if}
		</div>

		<div class="flex items-center justify-between gap-2">
			<Button variant="ghost" class="min-h-[44px]" onclick={toMarkPaid} disabled={submitting}
				>← Zurück</Button
			>
			<Button
				class="min-h-[44px]"
				onclick={submitExempt}
				disabled={!reasonValid || submitting}>Befreien ↵</Button
			>
		</div>
	{/if}
</div>

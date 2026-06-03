<script lang="ts">
	/**
	 * MarkPaidPopover — THE core Beitrag flow (spec §7.4 + §7.7).
	 *
	 * One popover, two in-place modes:
	 *  - "mark-paid": <input type="date"> + "Heute" chip + live EÜR-Buchung line
	 *    + Bezahlt (rosa primary) + Befreien (ghost, transforms to befreien-mode).
	 *    For overdue cells an extra "Erinnerung senden" button appears (§7.6).
	 *  - "befreien": required Grund input (submit disabled until non-empty) +
	 *    "← Zurück" (restores mark-paid mode, preserves gezahltAm) + Befreien.
	 *
	 * This component renders the popover *content*. The parent owns positioning
	 * (bits-ui Popover anchored to the trigger cell). Submit/cancel happen via
	 * callback props so the parent can run the form POST + optimistic flip.
	 *
	 * Money is rosa-default for the primary CTA (NEVER emerald). Enter submits,
	 * Esc cancels (handled by parent's Popover). 44pt targets. Dark-mode classes.
	 */
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { berlinYmd, berlinYear } from '$lib/domain/year.js';

	type Mode = 'mark-paid' | 'befreien';

	let {
		memberId,
		year,
		memberName,
		betragCents,
		isOverdue = false,
		isLocked = false,
		initialMode = 'mark-paid',
		submitting = false,
		onPaid,
		onExempt,
		onReminder,
		onCancel
	}: {
		memberId: string;
		year: number;
		memberName: string;
		betragCents: number;
		isOverdue?: boolean;
		isLocked?: boolean;
		initialMode?: Mode;
		submitting?: boolean;
		onPaid?: (detail: { memberId: string; year: number; gezahltAm: string }) => void;
		onExempt?: (detail: { memberId: string; year: number; reason: string }) => void;
		onReminder?: (detail: { memberId: string; year: number }) => void;
		onCancel?: () => void;
	} = $props();

	// Initialise mode from the prop's first value; subsequent mode changes are
	// driven by the in-popover transform buttons, not by prop updates. untrack
	// makes the capture-once intent explicit (silences state_referenced_locally).
	let mode = $state<Mode>(untrack(() => initialMode));
	let gezahltAm = $state(berlinYmd());
	let reason = $state('');
	let showReasonError = $state(false);
	let reasonInputEl = $state<HTMLInputElement | null>(null);

	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	// Live EÜR-Buchungsjahr — derived from the chosen date (ADR-0001 Berlin year).
	const euerYear = $derived.by(() => {
		if (!gezahltAm) return berlinYear();
		const parsed = new Date(`${gezahltAm}T12:00:00`);
		return Number.isNaN(parsed.getTime()) ? berlinYear() : berlinYear(parsed);
	});

	const reasonValid = $derived(reason.trim().length > 0);
	const titleId = $derived(`markpaid-title-${memberId}-${year}`);

	function toBefreien() {
		mode = 'befreien';
		showReasonError = false;
		// autofocus the reason input after the DOM updates
		queueMicrotask(() => reasonInputEl?.focus());
	}

	function toMarkPaid() {
		mode = 'mark-paid';
		reason = '';
		showReasonError = false;
	}

	function submitPaid() {
		if (submitting || isLocked) return;
		onPaid?.({ memberId, year, gezahltAm });
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
</script>

<div
	role="dialog"
	aria-labelledby={titleId}
	aria-modal="false"
	class="flex max-w-[280px] flex-col gap-3 p-1"
	data-mode={mode}
>
	{#if mode === 'mark-paid'}
		<h2 id={titleId} class="text-sm font-semibold text-foreground tabular-nums">
			{memberName} · {year} · {eur(betragCents)}
		</h2>

		<div class="flex flex-col gap-1.5">
			<!-- svelte-ignore a11y_label_has_associated_control -->
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

		<p
			class="text-xs text-muted-foreground tabular-nums"
			aria-live="polite"
			aria-atomic="true"
		>
			→ Wird in der EÜR {euerYear} als Einnahme verbucht
		</p>

		{#if isOverdue}
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

		<div class="flex items-center justify-between gap-2">
			<Button variant="ghost" onclick={toBefreien} disabled={submitting || isLocked}>
				Befreien
			</Button>
			<Button onclick={submitPaid} disabled={submitting || isLocked}>Bezahlt ↵</Button>
		</div>
	{:else}
		<h2 id={titleId} class="text-sm font-semibold text-foreground">
			{memberName} · {year} · Befreien
		</h2>

		<div class="flex flex-col gap-1.5">
			<!-- svelte-ignore a11y_label_has_associated_control -->
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
			<Button variant="ghost" onclick={toMarkPaid} disabled={submitting}>← Zurück</Button>
			<Button onclick={submitExempt} disabled={!reasonValid || submitting}>Befreien ↵</Button>
		</div>
	{/if}
</div>

<script lang="ts">
	/**
	 * ReminderRecipientRow — one `.copt` row in the Bulk-Reminder sheet
	 * (erinnerung-senden §4). Checkbox + Name/E-Mail + offener Betrag + Status.
	 *
	 * Non-candidates are shown honestly (never silently filtered): the checkbox is
	 * disabled and a flag explains why — "Keine E-Mail" (with a fix link) or
	 * "schon erinnert am {Datum}" (30-Tage-Schutz). CARDINAL RULE lives upstream
	 * (only owing members reach this list at all).
	 */
	import type { ReminderCandidate } from '$lib/domain/reminder-candidate.js';
	import BeitragCell from './BeitragCell.svelte';

	let {
		candidate,
		checked = $bindable(false),
		'data-testid': testId = 'reminder-recipient-row'
	}: {
		candidate: ReminderCandidate;
		/** Bindable — meaningful only when the candidate is selectable. */
		checked?: boolean;
		'data-testid'?: string;
	} = $props();

	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	function fmtDate(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	}

	// Force off + ignore any bound value when the row can't be selected.
	$effect(() => {
		if (!candidate.selectable && checked) checked = false;
	});
</script>

<label
	data-testid={testId}
	data-member-id={candidate.memberId}
	data-selectable={candidate.selectable ? 'true' : 'false'}
	class="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 {candidate.selectable
		? 'cursor-pointer bg-card hover:bg-muted/40'
		: 'cursor-not-allowed bg-muted/30'}"
>
	<input
		type="checkbox"
		bind:checked
		disabled={!candidate.selectable}
		data-testid="{testId}-check"
		class="h-4 w-4 shrink-0 accent-primary disabled:opacity-40"
	/>

	<div class="min-w-0 flex-1">
		<p class="truncate text-sm font-medium text-foreground">{candidate.name}</p>
		{#if candidate.blockedReason === 'no_email'}
			<p class="text-xs text-severity-warn-text" data-testid="{testId}-flag">
				Keine E-Mail hinterlegt
			</p>
		{:else if candidate.blockedReason === 'recently_reminded'}
			<p class="text-xs text-muted-foreground" data-testid="{testId}-flag">
				Schon erinnert{#if candidate.lastReminderAt}
					am {fmtDate(candidate.lastReminderAt)}{/if} (30-Tage-Schutz)
			</p>
		{:else}
			<p class="truncate text-xs text-muted-foreground">{candidate.email}</p>
		{/if}
	</div>

	<span class="shrink-0 text-sm font-semibold tabular-nums text-open-ink" data-testid="{testId}-amount">
		{eur(candidate.openCents)}
	</span>

	<BeitragCell state={candidate.state} betragCents={candidate.openCents} compact />
</label>

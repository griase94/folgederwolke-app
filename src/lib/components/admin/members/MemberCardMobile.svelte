<!--
  MemberCardMobile — compact card variant of MemberRow for use below the md
  breakpoint (PM-009). Package D: uses resolveBeitragState + BeitragStatusPill
  (single canonical resolver) instead of the old simpleBeitragStatus inline.

  - shows a single BeitragStatusPill for the current Buchungsjahr
  - card body is a tap-target → /app/mitglieder/{id}
  - open/partial (unpaid) rows get a trailing ≥44px pay affordance that opens
    MarkPaidControl (bottom-sheet on mobile).
-->
<script lang="ts">
	import type { MemberView } from '$lib/domain/members.js';
	import { currentBuchungsjahr, clampYearToAvailable, berlinYear } from '$lib/domain/year.js';
	import { resolveBeitragState, projectForList } from '$lib/domain/beitrag-state.js';
	import type { CellState } from '$lib/domain/beitrag-cell.js';
	import BeitragStatusPill from './BeitragStatusPill.svelte';
	import MarkPaidControl from './MarkPaidControl.svelte';

	let {
		member,
		years,
		satzByYear = {},
	}: {
		member: MemberView;
		years: number[];
		/** Per-year configured Beitragssatz (cents) — seeds the mark-paid popover. */
		satzByYear?: Record<number, number>;
	} = $props();

	function nameHash(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) {
			h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
		}
		return Math.abs(h);
	}

	const avatarColors = [
		'bg-rose-100 text-rose-900',
		'bg-pink-100 text-pink-900',
		'bg-fuchsia-100 text-fuchsia-900',
		'bg-purple-100 text-purple-900',
		'bg-violet-100 text-violet-900',
		'bg-indigo-100 text-indigo-900',
		'bg-sky-100 text-sky-900',
		'bg-teal-100 text-teal-900',
		'bg-emerald-100 text-emerald-900',
		'bg-amber-100 text-amber-900',
	];

	function avatarColor(name: string): string {
		return avatarColors[nameHash(name) % avatarColors.length] ?? avatarColors[0]!;
	}

	function initials(vorname: string, nachname: string): string {
		return (vorname.charAt(0) ?? '') + (nachname.charAt(0) ?? '');
	}

	// Package D: badge year = the actual current Buchungsjahr (ADR-0001),
	// clamped into the supplied window.
	const currentYear = $derived(
		years.length > 0 ? clampYearToAvailable(currentBuchungsjahr(), years) : null,
	);

	const eintrittsJahr = $derived(
		member.eintrittsDatum ? Number(member.eintrittsDatum.slice(0, 4)) : berlinYear(),
	);
	const austrittsJahr = $derived(
		member.austrittsDatum ? Number(member.austrittsDatum.slice(0, 4)) : null,
	);

	// Canonical resolver — single source of truth (Package D).
	const currentYearState = $derived.by(() => {
		if (currentYear === null) return null;
		const row = member.beitrags[currentYear] ?? null;
		return resolveBeitragState({
			year: currentYear,
			eintrittsJahr: eintrittsJahr,
			austrittsJahr: austrittsJahr,
			beitragExempt: member.beitragExempt,
			row: row
				? {
						betragCents: row.betragCents,
						paidCents: row.paidCents,
						isExempt: row.isExempt,
						gezahltAm: row.gezahltAm,
					}
				: null,
			satzCents: satzByYear[currentYear] ?? null,
			festBis: null,
		});
	});

	// Projected state: overdue→open for list display
	const displayState = $derived<CellState | null>(
		currentYearState !== null ? projectForList(currentYearState.state) : null,
	);

	// Show pay trigger only for open or partial, non-exempt, active members.
	const canMarkPaid = $derived(
		currentYear !== null &&
			displayState !== null &&
			(displayState === 'open' || displayState === 'partial') &&
			!member.beitragExempt &&
			!member.austrittsDatum,
	);

	// Seed betrag for the popover: the row's recorded amount if present, else satz.
	const currentBetragCents = $derived(
		currentYearState?.betragCents ?? 0,
	);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<!--
  The card body is a link to the detail page; the trailing "pay" button is
  a SIBLING (not nested) so we never put an interactive control inside an <a>.
-->
<div
	data-testid="member-card"
	data-member-id={member.id}
	class="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring"
>
	<a
		href="/app/mitglieder/{member.id}"
		class="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label="{member.nachname}, {member.vorname} – Details öffnen"
	>
		<div
			class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold {avatarColor(member.vorname + member.nachname)}"
			aria-hidden="true"
		>
			{initials(member.vorname, member.nachname).toUpperCase()}
		</div>

		<div class="min-w-0 flex-1">
			<p class="truncate font-medium text-foreground">{member.nachname}, {member.vorname}</p>
			{#if member.email}
				<p class="truncate text-xs text-muted-foreground">{member.email}</p>
			{/if}
			{#if member.austrittsDatum}
				<p class="text-xs text-destructive">(ausgetreten)</p>
			{/if}
		</div>

		<!-- Single BeitragStatusPill for the current year (Package D). -->
		{#if currentYear !== null && currentYearState !== null && displayState !== null}
			<BeitragStatusPill
				state={displayState}
				year={currentYear}
				paidCents={currentYearState.paidCents}
				betragCents={currentYearState.betragCents}
				compact
				exemptReason={member.beitragExemptReason}
			/>
		{/if}
	</a>

	<!-- One-tap pay affordance (open/partial only). MarkPaidControl renders a
	     bottom Sheet on mobile (< sm). Not nested inside the <a>. -->
	{#if canMarkPaid && currentYear !== null}
		<MarkPaidControl
			memberId={member.id}
			year={currentYear}
			memberName="{member.vorname} {member.nachname}"
			betragCents={currentBetragCents}
			paidCents={currentYearState?.paidCents ?? 0}
			allowExempt={false}
		>
			{#snippet trigger({ props })}
				<button
					{...props}
					type="button"
					data-testid="member-card-pay"
					aria-label="Beitrag {currentYear} erfassen für {member.vorname} {member.nachname}"
					class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/8 text-primary-text transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2.5"
						aria-hidden="true"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
				</button>
			{/snippet}
		</MarkPaidControl>
	{/if}
</div>

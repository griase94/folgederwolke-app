<!--
  MemberCardMobile — compact card variant of MemberRow for use below the md
  breakpoint (PM-009). The desktop row hides year beitrag chips already at
  sm; on a 390px screen we want a dedicated card that:

  - shows a single "Beitrag YYYY" summary instead of N year chips
  - card body is a tap-target → /app/mitglieder/{id}
  - open (unpaid, non-exempt) rows get a trailing ≥44px "Bezahlt" affordance
    that opens the SAME MarkPaidControl flow the matrix/list use (bottom-sheet
    on mobile) — previously the only way to mark paid on a phone was to drill
    into the detail page (members-list-no-pay-action finding).
-->
<script lang="ts">
	import {
		beitragStatusFor,
		type MemberView,
	} from '$lib/domain/members.js';
	import { currentBuchungsjahr, clampYearToAvailable } from '$lib/domain/year.js';
	import MarkPaidControl from './MarkPaidControl.svelte';

	let {
		member,
		years,
	}: {
		member: MemberView;
		years: number[];
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

	// Badge year = the actual current Buchungsjahr (ADR-0001 — never
	// new Date().getFullYear()), clamped into the supplied window so the badge
	// always references a year we have data for. Previously this used
	// Math.max(...years), which surfaced the FUTURE edge of the ±1 window
	// (anchorYear+1) rather than the year the treasurer actually cares about
	// (mobile-badge-max-year-not-current finding).
	const currentYear = $derived(
		years.length > 0 ? clampYearToAvailable(currentBuchungsjahr(), years) : null,
	);
	const currentBeitrag = $derived(currentYear !== null ? member.beitrags[currentYear] : null);
	const currentStatus = $derived(
		currentBeitrag ? beitragStatusFor(currentBeitrag) : 'open',
	);
	const statusLabel: Record<string, string> = {
		paid: 'Bezahlt',
		open: 'Offen',
		waived: 'Erlassen',
	};
	const statusColor: Record<string, string> = {
		paid: 'bg-green-50 text-green-700',
		open: 'bg-amber-50 text-amber-700',
		waived: 'bg-muted text-muted-foreground',
	};

	// Show the mark-paid affordance only for an open year on a non-exempt,
	// active member — mirrors the matrix's "open/overdue cell only" rule.
	const canMarkPaid = $derived(
		currentYear !== null &&
			currentStatus === 'open' &&
			!member.beitragExempt &&
			!member.austrittsDatum,
	);
	// Seed betrag for the popover: the row's recorded amount if present,
	// otherwise 0 (the server reads the configured Satz on submit).
	const currentBetragCents = $derived(currentBeitrag?.betragCents ?? 0);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<!--
  The card body is a link to the detail page; the trailing "Bezahlt" button is
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
			{#if member.beitragExempt}
				<span
					class="mt-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900 dark:text-amber-100"
					title={member.beitragExemptReason ?? ''}
					data-testid="member-card-befreit-badge"
				>befreit</span>
			{/if}
		</div>

		{#if currentYear !== null}
			<span
				class={[
					'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
					statusColor[currentStatus],
				].join(' ')}
				aria-label="Beitrag {currentYear}: {statusLabel[currentStatus]}"
			>
				{currentYear} · {statusLabel[currentStatus]}
			</span>
		{/if}
	</a>

	{#if canMarkPaid && currentYear !== null}
		<MarkPaidControl
			memberId={member.id}
			year={currentYear}
			memberName="{member.vorname} {member.nachname}"
			betragCents={currentBetragCents}
		>
			{#snippet trigger({ props })}
				<button
					{...props}
					type="button"
					data-testid="member-card-pay"
					aria-label="Beitrag {currentYear} als bezahlt markieren für {member.vorname} {member.nachname}"
					class="flex h-11 min-h-11 w-11 shrink-0 items-center justify-center rounded-full border border-green-300 bg-green-50 text-green-700 transition-colors hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2.5"
						aria-hidden="true"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				</button>
			{/snippet}
		</MarkPaidControl>
	{/if}
</div>

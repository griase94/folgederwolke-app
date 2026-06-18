<script lang="ts">
	/**
	 * BeitragStatusPill — Package C (member-zahlung redesign).
	 *
	 * Canonical per-member-per-year status pill. Used by every surface (list,
	 * detail, matrix) to render a single authoritative visual for a given
	 * (member, year) state. ALWAYS consume resolveBeitragState() upstream;
	 * never re-derive state here.
	 *
	 * Design rules (plan § C + Aurora master §2.1):
	 *   - Aurora token utilities ONLY — NO hardcoded hex.
	 *   - Text is the PRIMARY signal; icon is the reinforcer (WCAG 1.4.1).
	 *   - partial → amber (severity-warn tokens) + fraction "paid / betrag €".
	 *   - rosa (primary token family) → open/overdue CTA affordance.
	 *   - emerald → ONLY "paid" state.
	 *   - min-h-11 (44px) touch target on every interactive pill.
	 */
	import type { CellState } from '$lib/domain/beitrag-cell.js';

	let {
		state,
		year = 0,
		paidCents = 0,
		betragCents = 0,
		compact = false,
		exemptReason = null
	}: {
		state: CellState;
		year?: number;
		paidCents?: number;
		betragCents?: number;
		compact?: boolean;
		exemptReason?: string | null;
	} = $props();

	/** Format cents to short de-DE currency string, e.g. 3000 → "30 €". */
	function eur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	/** Accessible label for each state. */
	const ariaLabel = $derived((): string => {
		switch (state) {
			case 'paid':
				return `Bezahlt — ${eur(paidCents)}`;
			case 'partial':
				return `Teilweise bezahlt — ${eur(paidCents)} von ${eur(betragCents)}`;
			case 'open':
				return `Offen — ${eur(betragCents)} fällig`;
			case 'overdue':
				return `Offen (überfällig) — ${eur(betragCents)} fällig`;
			case 'exempt':
				return exemptReason ? `Befreit — ${exemptReason}` : 'Befreit';
			case 'permanently_exempt':
				return exemptReason ? `Dauerhaft befreit — ${exemptReason}` : 'Dauerhaft befreit';
			case 'not_applicable_pre_join':
				return `Mitglied war in ${year} noch nicht im Verein`;
			case 'not_applicable_post_austritt':
				return 'Mitglied ausgetreten';
			case 'locked_year':
				return `Jahr ${year} festgeschrieben`;
			default:
				return '';
		}
	});
</script>

<!--
  STATE → TOKENS TABLE (Aurora master §2.1 — NO hardcoded hex):
  ┌────────────────────────┬──────────────────────────────────────────────────┐
  │ paid                   │ bg-emerald-50 border-emerald-200 text-emerald-800│
  │ partial                │ bg-severity-warn/10 border-severity-warn/30      │
  │                        │ text-severity-warn-text                          │
  │ open                   │ bg-primary/8 border-primary/20 text-primary-text │
  │ overdue                │ bg-primary/8 border-primary/30 text-primary-text │
  │ exempt /               │ bg-ink-300/10 border-hairline text-ink-500       │
  │   permanently_exempt   │                                                  │
  │ not_applicable_*       │ bg-transparent text-ink-300 (muted dash)         │
  │ locked_year            │ bg-ink-300/10 border-hairline text-ink-500       │
  └────────────────────────┴──────────────────────────────────────────────────┘
-->

{#if state === 'paid'}
	<!-- emerald only = paid (plan rule: rosa is CTA, emerald = done) -->
	<span
		data-testid="beitrag-status-pill"
		data-state="paid"
		aria-label={ariaLabel()}
		class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[13px] font-medium text-emerald-800"
	>
		<!-- ✓ icon reinforcer -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			class="shrink-0"
		>
			<polyline points="20 6 9 17 4 12" />
		</svg>
		{#if !compact}
			Bezahlt
		{:else}
			<span class="sr-only">Bezahlt</span>
		{/if}
	</span>

{:else if state === 'partial'}
	<!-- amber severity tokens → partial payment fraction -->
	<span
		data-testid="beitrag-status-pill"
		data-state="partial"
		aria-label={ariaLabel()}
		class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-severity-warn/30 bg-severity-warn/10 px-3 text-[13px] font-medium text-severity-warn-text"
	>
		<!-- ◑ half-circle icon reinforcer for partial -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			class="shrink-0"
		>
			<path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" stroke="none" />
			<circle cx="12" cy="12" r="10" />
		</svg>
		<!-- fraction: "30 € / 60 €" — always shown (compact just omits extra labels) -->
		<span class="tabular-nums">{eur(paidCents)} / {eur(betragCents)}</span>
	</span>

{:else if state === 'open' || state === 'overdue'}
	<!-- rosa (primary token family) = pay CTA affordance for open/overdue -->
	<span
		data-testid="beitrag-status-pill"
		data-state={state}
		aria-label={ariaLabel()}
		class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 text-[13px] font-medium text-primary-text"
	>
		<!-- ○ open circle reinforcer -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			class="shrink-0"
		>
			<circle cx="12" cy="12" r="10" />
		</svg>
		Offen
	</span>

{:else if state === 'exempt' || state === 'permanently_exempt'}
	<!-- slate/ink muted tones — no owed amount -->
	<span
		data-testid="beitrag-status-pill"
		data-state={state}
		aria-label={ariaLabel()}
		class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hairline bg-ink-300/10 px-3 text-[13px] font-medium text-ink-500"
	>
		<!-- – ban / slash reinforcer for exempt -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			class="shrink-0"
		>
			<circle cx="12" cy="12" r="10" />
			<line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
		</svg>
		Befreit
	</span>

{:else if state === 'not_applicable_pre_join' || state === 'not_applicable_post_austritt'}
	<!-- muted dash — no debt, no action -->
	<span
		data-testid="beitrag-status-pill"
		data-state={state}
		aria-label={ariaLabel()}
		class="inline-flex min-h-11 items-center rounded-full px-3 text-[13px] text-ink-300"
	>
		—
	</span>

{:else if state === 'locked_year'}
	<!-- locked_year: muted + lock icon (rare — resolver returns underlying state with isLocked flag) -->
	<span
		data-testid="beitrag-status-pill"
		data-state="locked_year"
		aria-label={ariaLabel()}
		class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hairline bg-ink-300/10 px-3 text-[13px] font-medium text-ink-500"
	>
		<!-- 🔒 lock reinforcer -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			class="shrink-0"
		>
			<rect x="3" y="11" width="18" height="11" rx="2" />
			<path d="M7 11V7a5 5 0 0 1 10 0v4" />
		</svg>
		—
	</span>
{/if}

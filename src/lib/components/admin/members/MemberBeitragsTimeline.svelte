<script lang="ts">
	/**
	 * MemberBeitragsTimeline — Package D redesign.
	 *
	 * Key changes vs pre-Package-D:
	 *   - Always-present STATUS HERO for the current Buchungsjahr (even when no row
	 *     exists). The hero uses resolveBeitragState for honest status derivation.
	 *   - STATUS-DRIVEN rosa CTA: "Zahlung erfassen" (open/partial), "Zahlung
	 *     bearbeiten" (paid), nothing for exempt/ausgetreten (NO FALSE DEBT).
	 *   - Partial state shows paid/betrag fraction in the hero.
	 *   - Notes are displayed on timeline rows.
	 *   - Dashed empty state only for no-obligation years (not when there's a hero).
	 *   - Timeline rows also use resolveBeitragState (not simpleBeitragStatus).
	 */
	import MarkPaidControl from './MarkPaidControl.svelte';
	import BeitragStatusPill from './BeitragStatusPill.svelte';
	import { resolveBeitragState, projectForList } from '$lib/domain/beitrag-state.js';
	import type { CellState } from '$lib/domain/beitrag-cell.js';
	import { berlinYear } from '$lib/domain/year.js';

	type BeitragRow = {
		id: string;
		year: number;
		betragCents: number;
		paidCents: number;
		gezahltAm: string | null;
		notes: string | null;
		isExempt?: boolean;
		exemptReason?: string | null;
		createdAt: string;
		updatedAt: string;
	};

	let {
		beitrags,
		memberId,
		memberName = '',
		beitragExempt = false,
		beitragExemptReason = null,
		eintrittsJahr = null,
		austrittsJahr = null,
		/** Package D: current Buchungsjahr for the status hero. ADR-0001. */
		currentYear = null,
		/** Package D: satz by year for no-row betrag resolution. */
		satzByYear = {}
	}: {
		beitrags: BeitragRow[];
		memberId: string;
		/** Full name for the mark-paid popover heading + toast. */
		memberName?: string;
		beitragExempt?: boolean;
		beitragExemptReason?: string | null;
		/** Hide rows before this join year (§17 C5b / spec §9). */
		eintrittsJahr?: number | null;
		/** Hide rows after this leave year. */
		austrittsJahr?: number | null;
		/** Current Buchungsjahr for the always-present hero (ADR-0001). Defaults to berlinYear(). */
		currentYear?: number | null;
		/** Per-year Beitragssatz in cents — used by the hero for no-row open years. */
		satzByYear?: Record<number, number>;
	} = $props();

	const displayName = $derived(memberName.trim() || 'Mitglied');

	// Resolve the effective current year for the hero.
	const heroYear = $derived(currentYear ?? berlinYear());
	const heroEintrittsJahr = $derived(eintrittsJahr ?? heroYear);

	// Canonical state for the hero (Package D).
	const heroRow = $derived(beitrags.find((b) => b.year === heroYear) ?? null);
	const heroState = $derived(
		resolveBeitragState({
			year: heroYear,
			eintrittsJahr: heroEintrittsJahr,
			austrittsJahr: austrittsJahr ?? null,
			beitragExempt,
			row: heroRow
				? {
						betragCents: heroRow.betragCents,
						paidCents: heroRow.paidCents,
						isExempt: heroRow.isExempt ?? false,
						gezahltAm: heroRow.gezahltAm,
					}
				: null,
			satzCents: satzByYear[heroYear] ?? null,
			festBis: null,
		}),
	);

	// Projected display state (overdue→open for the list projection)
	const heroDisplayState = $derived<CellState>(projectForList(heroState.state));

	// Status-driven CTA mode:
	//   open | partial → "Zahlung erfassen" (mark-paid)
	//   paid           → "Zahlung bearbeiten" (edit)
	//   exempt / permanently_exempt / not_applicable_* → nothing
	const heroCTAMode = $derived.by((): 'erfassen' | 'bearbeiten' | null => {
		if (
			heroDisplayState === 'open' ||
			heroDisplayState === 'overdue' ||
			heroDisplayState === 'partial'
		) {
			return 'erfassen';
		}
		if (heroDisplayState === 'paid') return 'bearbeiten';
		return null;
	});

	// §9 / §17 C5b — only show years the member was actually in the Verein.
	const visibleBeitrags = $derived(
		beitrags.filter(
			(b) =>
				(eintrittsJahr === null || b.year >= eintrittsJahr) &&
				(austrittsJahr === null || b.year <= austrittsJahr),
		),
	);

	// Sorted newest first
	const sorted = $derived([...visibleBeitrags].sort((a, b) => b.year - a.year));

	const totalPaidCents = $derived(
		visibleBeitrags.reduce((sum, b) => sum + Math.min(b.paidCents, b.betragCents), 0),
	);
	const totalOpenCents = $derived(
		beitragExempt
			? 0
			: visibleBeitrags.reduce((sum, b) => sum + Math.max(0, b.betragCents - b.paidCents), 0),
	);

	function fmtEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	function fmtDate(d: string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('de-DE', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	}

	// Derive status for a timeline row via the canonical resolver.
	function rowResolve(b: BeitragRow) {
		return resolveBeitragState({
			year: b.year,
			eintrittsJahr: eintrittsJahr ?? b.year,
			austrittsJahr: austrittsJahr ?? null,
			beitragExempt,
			row: {
				betragCents: b.betragCents,
				paidCents: b.paidCents,
				isExempt: b.isExempt ?? false,
				gezahltAm: b.gezahltAm,
			},
			satzCents: satzByYear[b.year] ?? null,
			festBis: null,
		});
	}

	function rowDisplayState(b: BeitragRow): CellState {
		return projectForList(rowResolve(b).state);
	}

	// Status label for timeline rows
	const statusLabel: Record<string, string> = {
		paid: 'bezahlt',
		partial: 'teilweise bezahlt',
		open: 'offen',
		overdue: 'offen',
		exempt: 'befreit',
		permanently_exempt: 'befreit',
		not_applicable_pre_join: '—',
		not_applicable_post_austritt: '—',
		locked_year: 'festgeschrieben',
	};

	const statusClasses: Record<string, string> = {
		paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
		partial: 'bg-severity-warn/10 text-severity-warn-text border-severity-warn/30',
		open: 'bg-primary/8 text-primary-text border-primary/20',
		overdue: 'bg-primary/8 text-primary-text border-primary/20',
		exempt: 'bg-ink-300/10 text-ink-500 border-hairline',
		permanently_exempt: 'bg-ink-300/10 text-ink-500 border-hairline',
		not_applicable_pre_join: 'bg-transparent text-ink-300',
		not_applicable_post_austritt: 'bg-transparent text-ink-300',
		locked_year: 'bg-ink-300/10 text-ink-500 border-hairline',
	};
</script>

<div class="space-y-4">
	<!-- ── Package D: ALWAYS-PRESENT STATUS HERO for current Buchungsjahr ────── -->
	<div
		data-testid="beitrags-hero"
		class="rounded-2xl border border-border bg-card p-5 shadow-sm"
	>
		<div class="mb-3 flex items-center justify-between gap-2">
			<div>
				<p class="text-xs font-medium text-muted-foreground">Beitrag {heroYear}</p>
				<div class="mt-1">
					<BeitragStatusPill
						state={heroDisplayState}
						year={heroYear}
						paidCents={heroState.paidCents}
						betragCents={heroState.betragCents}
						exemptReason={beitragExemptReason}
					/>
				</div>
			</div>

			<!-- Amount info -->
			<div class="text-right">
				{#if heroDisplayState === 'partial'}
					<p class="text-sm font-semibold text-foreground tabular-nums">
						{fmtEur(heroState.paidCents)} <span class="text-muted-foreground font-normal">/ {fmtEur(heroState.betragCents)}</span>
					</p>
					<p class="text-xs text-muted-foreground">
						Noch offen: {fmtEur(heroState.betragCents - heroState.paidCents)}
					</p>
				{:else if heroState.betragCents > 0}
					<p class="text-sm font-semibold text-foreground tabular-nums">
						{fmtEur(heroState.betragCents)}
					</p>
				{:else if heroState.satzMissing}
					<p class="text-xs text-muted-foreground">Beitragssatz {heroYear} fehlt</p>
				{/if}
			</div>
		</div>

		<!-- STATUS-DRIVEN CTA (Package D — NO FALSE DEBT).
		     open/partial → "Zahlung erfassen" (rosa primary).
		     paid         → "Zahlung bearbeiten" (outline).
		     exempt / ausgetreten / pre_eintritt → nothing. -->
		{#if heroCTAMode !== null}
			<MarkPaidControl
				{memberId}
				year={heroYear}
				memberName={displayName}
				betragCents={heroState.betragCents}
				paidCents={heroState.paidCents}
				actionBase="/app/mitglieder"
				allowExempt={false}
			>
				{#snippet trigger({ props })}
					<button
						{...props}
						type="button"
						data-testid="beitrags-hero-cta"
						class={[
							'mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
							heroCTAMode === 'erfassen'
								? 'bg-primary-strong text-white hover:bg-primary-strong/90'
								: 'border border-border bg-transparent text-foreground hover:bg-muted',
						].join(' ')}
					>
						{#if heroCTAMode === 'erfassen'}
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
							</svg>
							Zahlung erfassen
						{:else}
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
							</svg>
							Zahlung bearbeiten
						{/if}
					</button>
				{/snippet}
			</MarkPaidControl>
		{/if}
	</div>

	<!-- Summary totals (only when there are historical rows) -->
	{#if beitrags.length > 0}
		<div class="grid grid-cols-2 gap-3">
			<div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
				<p class="text-xs font-medium text-emerald-700">Gesamt bezahlt</p>
				<p class="mt-0.5 text-lg font-bold text-emerald-800">{fmtEur(totalPaidCents)}</p>
			</div>
			<div
				class="rounded-xl border px-4 py-3
				{totalOpenCents > 0
					? 'border-amber-200 bg-amber-50'
					: 'border-border bg-muted'}"
			>
				<p class="text-xs font-medium {totalOpenCents > 0 ? 'text-amber-700' : 'text-muted-foreground'}">
					Gesamt offen
				</p>
				<p
					class="mt-0.5 text-lg font-bold {totalOpenCents > 0
						? 'text-amber-800'
						: 'text-muted-foreground'}"
				>
					{fmtEur(totalOpenCents)}
				</p>
			</div>
		</div>
	{/if}

	<!-- Exempt banner above timeline -->
	{#if beitragExempt}
		<div
			class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
			data-testid="beitragsverlauf-exempt-banner"
		>
			<p class="font-medium">Beitragspflicht ausgesetzt</p>
			{#if beitragExemptReason}
				<p class="mt-0.5 text-xs text-amber-700">
					Grund: {beitragExemptReason}
				</p>
			{/if}
		</div>
	{/if}

	<!-- Historical timeline -->
	{#if sorted.length === 0}
		<!-- Dashed empty: only shows when there are NO rows (no obligation history). -->
		<div class="rounded-xl border border-dashed border-border py-10 text-center">
			<svg
				class="mx-auto mb-3 h-8 w-8 text-muted-foreground/40"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1.5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
				/>
			</svg>
			<p class="text-sm text-muted-foreground">Noch keine Beitragsdaten vorhanden</p>
		</div>
	{:else}
		<div class="relative space-y-0">
			<!-- Vertical line -->
			<div
				class="absolute bottom-4 left-[19px] top-4 w-px bg-border"
				aria-hidden="true"
			></div>

			{#each sorted as b (b.id)}
				{@const st = rowDisplayState(b)}
				<div
					class="relative flex items-start gap-4 pb-4"
					data-testid="beitragsverlauf-row"
					data-year={b.year}
					data-status={st}
				>
					<!-- Timeline dot -->
					<div
						class="relative z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-background
						{st === 'paid'
							? 'border-emerald-400'
							: st === 'partial'
								? 'border-amber-400'
								: st === 'open' || st === 'overdue'
									? 'border-primary/40'
									: st === 'exempt' || st === 'permanently_exempt'
										? 'border-amber-300'
										: 'border-gray-300'}"
					>
						{#if st === 'paid'}
							<svg
								class="h-2.5 w-2.5 text-emerald-600"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									fill-rule="evenodd"
									d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
						{:else if st === 'partial'}
							<div class="h-2 w-2 rounded-full bg-amber-400"></div>
						{:else if st === 'open' || st === 'overdue'}
							<div class="h-2 w-2 rounded-full bg-primary/40"></div>
						{:else if st === 'exempt' || st === 'permanently_exempt'}
							<div class="h-2 w-2 rounded-full bg-amber-200"></div>
						{/if}
					</div>

					<!-- Row content -->
					<div
						class="flex flex-1 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:gap-0"
					>
						<!-- Year + status -->
						<div class="flex flex-1 items-center gap-3">
							<span class="w-12 text-base font-bold text-foreground tabular-nums">
								{b.year}
							</span>
							<span
								class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium {statusClasses[st] ?? ''}"
							>
								{statusLabel[st] ?? st}
							</span>
						</div>

						<!-- Amount + date -->
						<div class="flex items-center gap-4 text-sm">
							{#if st === 'partial'}
								<span class="font-medium text-foreground tabular-nums">
									{fmtEur(b.paidCents)} / {fmtEur(b.betragCents)}
								</span>
							{:else}
								<span class="font-medium text-foreground tabular-nums">
									{fmtEur(b.betragCents)}
								</span>
							{/if}
							{#if b.gezahltAm}
								<span class="text-muted-foreground">
									{fmtDate(b.gezahltAm)}
								</span>
							{/if}
						</div>

						<!-- Notes display (Package D) -->
						{#if b.notes}
							<p class="mt-1 text-xs text-muted-foreground sm:ml-4 sm:mt-0" data-testid="beitragsverlauf-notes">
								{b.notes}
							</p>
						{/if}

						<!-- Row-level mark paid action.
						     Shown for open or partial rows only (not exempt, paid, ausgetreten).
						     Opens MarkPaidControl (shares the same controlled popover). -->
						{#if st === 'open' || st === 'partial'}
							<MarkPaidControl
								{memberId}
								year={b.year}
								memberName={displayName}
								betragCents={b.betragCents}
								paidCents={b.paidCents}
								actionBase="/app/mitglieder"
								allowExempt={false}
							>
								{#snippet trigger({ props })}
									<button
										{...props}
										type="button"
										data-testid="beitragsverlauf-mark-paid"
										class="mt-2 flex min-h-11 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/8 px-3 py-1.5 text-xs font-medium text-primary-text transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-4 sm:mt-0"
									>
										<svg
											class="h-3 w-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2.5"
											aria-hidden="true"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
										</svg>
										{st === 'partial' ? 'Restbetrag erfassen' : 'Als bezahlt markieren'}
									</button>
								{/snippet}
							</MarkPaidControl>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

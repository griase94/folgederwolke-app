<script lang="ts">
	import { beitragStatusFor, type BeitragStatus } from '$lib/domain/members.js';
	import MarkPaidControl from './MarkPaidControl.svelte';

	type BeitragRow = {
		id: string;
		year: number;
		betragCents: number;
		paidCents: number;
		gezahltAm: string | null;
		notes: string | null;
		createdAt: string;
		updatedAt: string;
	};

	// Night-2 C5-MEM-full — accept member-level exempt flag so the timeline
	// can decorate ALL rows as `befreit` (Beitragspflicht-Aussetzung) and
	// hide the "als bezahlt markieren" CTA for them. The flag is propagated
	// as a 4th status type — `exempt` — purely for display; the underlying
	// rows keep their own paid/open/waived semantic in the DB.
	type RowStatus = BeitragStatus | 'exempt';

	let {
		beitrags,
		memberId,
		memberName = '',
		beitragExempt = false,
		beitragExemptReason = null,
		eintrittsJahr = null,
		austrittsJahr = null
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
	} = $props();

	// The detail page may not pass a name; degrade gracefully to a generic term
	// so the popover heading / toast never reads with a dangling leading space.
	const displayName = $derived(memberName.trim() || 'Mitglied');

	// §9 / §17 C5b — only show years the member was actually in the Verein.
	const visibleBeitrags = $derived(
		beitrags.filter(
			(b) =>
				(eintrittsJahr === null || b.year >= eintrittsJahr) &&
				(austrittsJahr === null || b.year <= austrittsJahr)
		)
	);

	// Sorted newest first (server already orders this, but be explicit)
	const sorted = $derived([...visibleBeitrags].sort((a, b) => b.year - a.year));

	const totalPaidCents = $derived(
		visibleBeitrags.reduce((sum, b) => sum + Math.min(b.paidCents, b.betragCents), 0)
	);
	// Night-2 C5-MEM-full: exempt members don't owe anything — clamp `open`
	// to zero so the summary matches the matrix aggregate.
	const totalOpenCents = $derived(
		beitragExempt
			? 0
			: visibleBeitrags.reduce((sum, b) => sum + Math.max(0, b.betragCents - b.paidCents), 0)
	);

	function fmtEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	function fmtDate(d: string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('de-DE', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	const statusLabel: Record<RowStatus, string> = {
		paid: 'bezahlt',
		open: 'offen',
		waived: 'erlassen',
		// Night-2 C5-MEM-full
		exempt: 'befreit'
	};

	const statusClasses: Record<RowStatus, string> = {
		paid: 'bg-green-100 text-green-800 border-green-200',
		open: 'bg-amber-100 text-amber-800 border-amber-200',
		waived: 'bg-gray-100 text-gray-500 border-gray-200',
		// Night-2 C5-MEM-full — amber-tinted but distinct from `open` to
		// communicate "active waiver" rather than "owed".
		exempt: 'bg-amber-50 text-amber-700 border-amber-200'
	};

	/**
	 * Combine member-level exempt with the row-level paid/open/waived
	 * semantic. Exempt overrides everything except `paid` (a fully-paid
	 * row stays "bezahlt" even if the member is later marked exempt — we
	 * preserve history).
	 */
	function rowStatus(b: BeitragRow): RowStatus {
		const base = beitragStatusFor(b);
		if (base === 'paid') return 'paid';
		return beitragExempt ? 'exempt' : base;
	}
</script>

<div class="space-y-4">
	<!-- Summary row -->
	{#if beitrags.length > 0}
		<div class="grid grid-cols-2 gap-3">
			<div class="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
				<p class="text-xs font-medium text-green-700">Gesamt bezahlt</p>
				<p class="mt-0.5 text-lg font-bold text-green-800">{fmtEur(totalPaidCents)}</p>
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

	<!-- Night-2 C5-MEM-full — exempt banner sits ABOVE the timeline (or empty
	     state) so admins still see the Beitragsbefreit context even before
	     any Beitragsrows exist for this member. -->
	{#if beitragExempt}
		<div
			class="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
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

	<!-- Timeline -->
	{#if sorted.length === 0}
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
				class="absolute left-[19px] top-4 bottom-4 w-px bg-border"
				aria-hidden="true"
			></div>

			{#each sorted as b (b.id)}
				{@const status = rowStatus(b)}
				<div
					class="relative flex items-start gap-4 pb-4"
					data-testid="beitragsverlauf-row"
					data-year={b.year}
					data-status={status}
				>
					<!-- Timeline dot -->
					<div
						class="relative z-10 mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 bg-background
						{status === 'paid'
							? 'border-green-400'
							: status === 'open'
								? 'border-amber-400'
								: status === 'exempt'
									? 'border-amber-300'
									: 'border-gray-300'}"
					>
						{#if status === 'paid'}
							<svg
								class="h-2.5 w-2.5 text-green-600"
								fill="currentColor"
								viewBox="0 0 20 20"
							>
								<path
									fill-rule="evenodd"
									d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
						{:else if status === 'open'}
							<div class="h-2 w-2 rounded-full bg-amber-400"></div>
						{:else if status === 'exempt'}
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
								class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium {statusClasses[status]}"
							>
								{statusLabel[status]}
							</span>
						</div>

						<!-- Amount + date -->
						<div class="flex items-center gap-4 text-sm">
							<span class="font-medium text-foreground tabular-nums">
								{fmtEur(b.betragCents)}
							</span>
							{#if b.gezahltAm}
								<span class="text-muted-foreground">
									{fmtDate(b.gezahltAm)}
								</span>
							{/if}
						</div>

						<!-- Mark paid action — hidden for exempt members; admins must
						     clear the exempt flag before recording a payment. Opens the
						     shared MarkPaidControl (date + live EÜR line + undo toast) so
						     the detail page matches the list + matrix flow exactly. -->
						{#if status !== 'paid' && status !== 'waived' && status !== 'exempt'}
							<MarkPaidControl
								{memberId}
								year={b.year}
								memberName={displayName}
								betragCents={b.betragCents}
								actionBase="/app/mitglieder"
								allowExempt={false}
							>
								{#snippet trigger({ props })}
									<button
										{...props}
										type="button"
										data-testid="beitragsverlauf-mark-paid"
										class="mt-2 flex min-h-11 items-center gap-1.5 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-4 sm:mt-0 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300"
									>
										<svg
											class="h-3 w-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2.5"
											aria-hidden="true"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
										Als bezahlt markieren
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

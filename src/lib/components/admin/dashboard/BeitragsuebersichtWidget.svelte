<!--
	BeitragsuebersichtWidget — dashboard slot between WGB and activity feed.

	Task 2.10 enhancement (spec §6): leads with the overdue chip when overdue>0
	(click-through to ?filter=ueberfaellig), shows a persistent success state at
	100% paid (CheckCircle2, no emoji), and a "+N Vorjahre" badge for prior-year
	debt. All numbers tabular-nums, dark-mode classes from day one.

	Preserves the existing data-testid contract (-widget / -paid / -paid-count /
	-open-count / -open) so the C4-DASH-lite E2E suite keeps passing.
-->
<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';

	interface Props {
		year: number;
		memberCount: number;
		paidCents: number;
		offenCents: number;
		paidMemberCount: number;
		openMemberCount: number;
		/** Members past Fälligkeit + grace for the current year. */
		overdueCount?: number;
		/** Latest gezahlt_am for the year (ISO), for the success-state line. */
		lastPaymentDate?: string | null;
		/** Distinct prior years that still have unpaid, non-exempt rows. */
		priorYearsUnpaidCount?: number;
	}

	let {
		year,
		memberCount,
		paidCents,
		offenCents,
		paidMemberCount,
		openMemberCount,
		overdueCount = 0,
		lastPaymentDate = null,
		priorYearsUnpaidCount = 0
	}: Props = $props();

	const fmtEur = (c: number) =>
		(c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	const totalCents = $derived(paidCents + offenCents);
	const paidPct = $derived(totalCents === 0 ? 0 : Math.round((paidCents / totalCents) * 100));
	const allPaid = $derived(memberCount > 0 && openMemberCount === 0 && overdueCount === 0);

	function fmtDateDe(iso: string | null): string {
		if (!iso) return '—';
		const [y, m, d] = iso.split('-');
		return `${d}.${m}.${y}`;
	}

	// Overdue leads → link to the filtered matrix; otherwise the plain matrix.
	const href = $derived(
		overdueCount > 0
			? `/app/mitglieder?view=matrix&year=${year}&filter=ueberfaellig`
			: `/app/mitglieder?view=matrix&year=${year}`
	);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	{href}
	class="block rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-border/60 dark:bg-card/40 dark:hover:bg-muted/30"
	data-testid="beitragsuebersicht-widget"
	data-year={year}
>
	{#if allPaid}
		<!-- Persistent success state (F17) — no emoji, lucide CheckCircle2 -->
		<div class="flex items-start gap-2">
			<CheckCircle2
				size={18}
				class="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
				aria-hidden="true"
			/>
			<div>
				<h2 class="text-sm font-medium text-foreground">Mitgliedsbeiträge {year}</h2>
				<p class="mt-0.5 text-sm text-foreground tabular-nums">
					Alle {memberCount} Mitglieder bezahlt · <span data-testid="beitragsuebersicht-paid"
						>{fmtEur(paidCents)}</span
					>
				</p>
				{#if lastPaymentDate}
					<p class="mt-1 text-xs text-muted-foreground tabular-nums">
						Letzte Zahlung: {fmtDateDe(lastPaymentDate)}
					</p>
				{/if}
			</div>
			<span class="ml-auto text-xs text-muted-foreground" aria-hidden="true">→</span>
		</div>
		<!-- Hidden counts preserve the testid contract even in success state. -->
		<span class="sr-only">
			<span data-testid="beitragsuebersicht-paid-count">{paidMemberCount}</span>
			<span data-testid="beitragsuebersicht-open-count">{openMemberCount}</span>
			<span data-testid="beitragsuebersicht-open">{fmtEur(offenCents)}</span>
		</span>
	{:else}
		<div class="flex items-start justify-between gap-2">
			<h2 class="text-sm font-medium text-muted-foreground">Mitgliedsbeiträge {year}</h2>
			<div class="flex items-center gap-1.5">
				{#if overdueCount > 0}
					<span
						class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 tabular-nums dark:bg-amber-900/50 dark:text-amber-200"
						data-testid="beitragsuebersicht-overdue"
					>
						<TriangleAlert size={12} aria-hidden="true" />
						{overdueCount} überfällig
					</span>
				{/if}
				<span class="text-xs text-muted-foreground" aria-hidden="true">→</span>
			</div>
		</div>

		<p
			class="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums"
			data-testid="beitragsuebersicht-paid"
		>
			{fmtEur(paidCents)}
		</p>
		<p class="mt-1 text-xs text-muted-foreground tabular-nums">
			<span data-testid="beitragsuebersicht-paid-count">{paidMemberCount}</span> von {memberCount}
			bezahlt · <span data-testid="beitragsuebersicht-open-count">{openMemberCount}</span> offen
			(<span data-testid="beitragsuebersicht-open">{fmtEur(offenCents)}</span>)
		</p>
		<div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-muted/40">
			<!-- Semantic exception: paid-progress uses emerald (not rosa) — a rosa
			     "paid" bar reads as cognitive dissonance per spec §6 risk note. -->
			<div
				class="h-full bg-emerald-500 transition-all dark:bg-emerald-400"
				style="width: {paidPct}%"
			></div>
		</div>

		{#if priorYearsUnpaidCount > 0}
			<p class="mt-2">
				<span
					class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums dark:bg-muted/40"
					data-testid="beitragsuebersicht-vorjahre"
				>
					+{priorYearsUnpaidCount}
					{priorYearsUnpaidCount === 1 ? 'Vorjahr' : 'Vorjahre'}
				</span>
			</p>
		{/if}
	{/if}
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->

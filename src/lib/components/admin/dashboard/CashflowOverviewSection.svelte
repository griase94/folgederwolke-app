<script lang="ts" module>
	/**
	 * Dashboard cashflow overview — replaces the legacy 4-identical-KPI grid.
	 *
	 * Layout (cycle 2):
	 *   • Two large KPI cards (Einnahmen {year}, Ausgaben {year}) on top.
	 *   • Four small sphere-chip strip BELOW each headline card (per-sphere
	 *     YTD subtotal — ideeller / vermoegen / zweckbetrieb / wirtschaftlich).
	 *   • Four link chips below: Saldo (via <Money>), Offene Rechnungen,
	 *     Inbox, Mitglieder.
	 *   • Year-lock badge next to the heading when selectedYear is in the
	 *     festgeschrieben window (settings.festgeschrieben_bis).
	 *
	 * All EUR values are integer cents (ADR-0003). Year-scoped to whichever
	 * fiscal year the C2 year-switcher set via ?year=NNNN.
	 *
	 * Resolves (cycle 1): VB-003 (cashflow at a glance), JB-005 (KPIs all
	 * the same), UI-008 (no hierarchy / link affordance), UX-330 (dashboard
	 * is dead).
	 * Resolves (cycle 2): C3-3 (sphere chips), C3-4 (festschreibung lock),
	 * C3-6 (Money in saldo chip), C3-9 (anglicism "YTD" → "{year}").
	 */
	import type { CashflowOverview } from '$lib/server/domain/dashboard.js';

	export interface CashflowOverviewSectionProps {
		cashflow: CashflowOverview;
		openInboxCount: number;
		activeMemberCount: number;
		/**
		 * From `settings.festgeschrieben_bis`. When `cashflow.year` is
		 * <= this value, a lock badge is rendered next to the heading
		 * to signal the year is closed (write actions disabled
		 * downstream via the trigger; this is the visual cue).
		 */
		festgeschriebenBis?: number | null;
	}

	const SPHERE_LABELS: Record<string, string> = {
		ideeller: 'Ideeller',
		vermoegen: 'Vermögen',
		zweckbetrieb: 'Zweckbetrieb',
		wirtschaftlich: 'Wirtschaftlich',
	};
	const SPHERE_ORDER = ['ideeller', 'zweckbetrieb', 'wirtschaftlich', 'vermoegen'] as const;
</script>

<script lang="ts">
	import LargeKpiCard from './LargeKpiCard.svelte';
	import LinkChip from './LinkChip.svelte';
	import { Money } from '$lib/components/ui/money/index.js';
	import { formatMoney } from '$lib/components/ui/money/index.js';
	import { clampMonthlyForCurrentYear } from '$lib/domain/cashflow.js';
	import { berlinYear } from '$lib/domain/year.js';

	let {
		cashflow,
		openInboxCount,
		activeMemberCount,
		festgeschriebenBis = null,
	}: CashflowOverviewSectionProps = $props();

	// Phase 8 T6: /app/transactions retired → cashflow cards link to the
	// per-tab list routes (the old single base + dead `&kind=` suffix sent the
	// Einnahmen card to the AUSGABEN list since `kind` isn't a parsed param).
	const einnahmenBase = $derived(`/app/einnahmen?year=${cashflow.year}`);
	const ausgabenBase = $derived(`/app/ausgaben?year=${cashflow.year}`);

	const saldoTone = $derived<'success' | 'danger' | 'default'>(
		cashflow.saldoCents > 0 ? 'success' : cashflow.saldoCents < 0 ? 'danger' : 'default',
	);

	const isLocked = $derived(
		festgeschriebenBis !== null &&
			festgeschriebenBis !== undefined &&
			cashflow.year <= festgeschriebenBis,
	);

	// C3-5 (cycle 2): clamp sparkline data to YTD window for the current
	// Berlin year so Apr-Dec trailing zeros don't make the line look like
	// a "crash" against early-year peaks.
	const now = new Date();
	const currentYear = berlinYear(now);
	const currentMonth = parseInt(
		new Intl.DateTimeFormat('en-US', {
			timeZone: 'Europe/Berlin',
			month: 'numeric',
		}).format(now),
		10,
	);

	const einnahmenSparkData = $derived(
		clampMonthlyForCurrentYear(
			cashflow.einnahmenMonthlyCents,
			cashflow.year,
			currentYear,
			currentMonth,
		),
	);
	const ausgabenSparkData = $derived(
		clampMonthlyForCurrentYear(
			cashflow.ausgabenMonthlyCents,
			cashflow.year,
			currentYear,
			currentMonth,
		),
	);
</script>

<section aria-labelledby="cashflow-heading" class="mb-8">
	<h2 id="cashflow-heading" class="sr-only">
		Kassenüberblick {cashflow.year}
		{#if isLocked}— festgeschrieben{/if}
	</h2>

	{#if isLocked}
		<div class="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
			<span
				data-testid="year-lock"
				aria-label={`Jahr ${cashflow.year} ist festgeschrieben`}
				class="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
			>
				<!-- inline lock glyph (no icon-library dep) -->
				<svg
					aria-hidden="true"
					viewBox="0 0 20 20"
					class="h-3.5 w-3.5"
					fill="currentColor"
				>
					<path
						d="M10 1a4 4 0 00-4 4v3H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm-2 4a2 2 0 014 0v3H8V5z"
					/>
				</svg>
				Festgeschrieben {cashflow.year}
			</span>
		</div>
	{/if}

	<!-- 2 large headline KPI cards -->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<div class="space-y-2">
			<LargeKpiCard
				label={`Einnahmen ${cashflow.year}`}
				valueInCents={cashflow.einnahmenYtdCents}
				sparklineData={einnahmenSparkData}
				lyValueInCents={cashflow.einnahmenLyYtdCents}
				tone="income"
				href={einnahmenBase}
			/>
			<!-- C3-3: per-sphere subtotals beneath the headline card -->
			<div class="grid grid-cols-4 gap-1" role="list" aria-label="Einnahmen nach Sphäre">
				{#each SPHERE_ORDER as sphere (sphere)}
					<div
						role="listitem"
						data-testid="sphere-chip"
						data-sphere={sphere}
						class="flex flex-col items-start rounded-md border border-border bg-card px-2 py-1"
					>
						<span class="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
							{SPHERE_LABELS[sphere]}
						</span>
						<span class="text-xs font-medium tabular-nums" title={SPHERE_LABELS[sphere]}>
							{formatMoney(cashflow.einnahmenBySphereCents[sphere], 'never')}
						</span>
					</div>
				{/each}
			</div>
		</div>

		<div class="space-y-2">
			<LargeKpiCard
				label={`Ausgaben ${cashflow.year}`}
				valueInCents={cashflow.ausgabenYtdCents}
				sparklineData={ausgabenSparkData}
				lyValueInCents={cashflow.ausgabenLyYtdCents}
				tone="expense"
				href={ausgabenBase}
			/>
			<div class="grid grid-cols-4 gap-1" role="list" aria-label="Ausgaben nach Sphäre">
				{#each SPHERE_ORDER as sphere (sphere)}
					<div
						role="listitem"
						data-testid="sphere-chip"
						data-sphere={sphere}
						class="flex flex-col items-start rounded-md border border-border bg-card px-2 py-1"
					>
						<span class="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
							{SPHERE_LABELS[sphere]}
						</span>
						<span class="text-xs font-medium tabular-nums" title={SPHERE_LABELS[sphere]}>
							{formatMoney(cashflow.ausgabenBySphereCents[sphere], 'never')}
						</span>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- 4 link chips -->
	<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={ausgabenBase}
			data-testid="link-chip"
			aria-label={`Saldo ${cashflow.year}`}
			class="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
		>
			<span class="text-sm font-medium text-muted-foreground group-hover:text-foreground">
				Saldo
			</span>
			<span
				class={`inline-flex min-w-[2.5ch] items-center justify-center rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ${
					saldoTone === 'success'
						? 'bg-emerald-100 dark:bg-emerald-900/50'
						: saldoTone === 'danger'
							? 'bg-rose-100 dark:bg-rose-900/50'
							: 'bg-muted'
				}`}
			>
				<Money valueInCents={cashflow.saldoCents} forceSign="auto" />
			</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		<LinkChip
			label="Offene Rechnungen"
			value={String(cashflow.openInvoicesCount)}
			href={`/app/rechnungen?status=offen&year=${cashflow.year}`}
			tone={cashflow.openInvoicesCount > 0 ? 'warning' : 'default'}
		/>
		<LinkChip
			label="Inbox"
			value={String(openInboxCount)}
			href="/app/inbox"
			tone={openInboxCount > 0 ? 'warning' : 'default'}
		/>
		<LinkChip
			label="Mitglieder"
			value={String(activeMemberCount)}
			href="/app/mitglieder"
		/>
	</div>
</section>

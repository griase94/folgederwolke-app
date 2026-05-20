<script lang="ts" module>
	/**
	 * Dashboard cashflow overview — replaces the legacy 4-identical-KPI grid.
	 *
	 * Layout:
	 *   • Two large KPI cards (Einnahmen YTD, Ausgaben YTD) on top.
	 *   • Four link chips below: Saldo, Offene Rechnungen, Inbox, Mitglieder.
	 *
	 * All EUR values are integer cents (ADR-0003). Year-scoped to whichever
	 * fiscal year the C2 year-switcher set via ?year=NNNN.
	 *
	 * Resolves: VB-003 (cashflow at a glance), JB-005 (KPIs all the same),
	 * UI-008 (no hierarchy / link affordance), UX-330 (dashboard is dead).
	 */
	import type { CashflowOverview } from '$lib/server/domain/dashboard.js';

	export interface CashflowOverviewSectionProps {
		cashflow: CashflowOverview;
		openInboxCount: number;
		activeMemberCount: number;
	}
</script>

<script lang="ts">
	import LargeKpiCard from './LargeKpiCard.svelte';
	import LinkChip from './LinkChip.svelte';
	import { formatMoney } from '$lib/components/ui/money/index.js';

	let { cashflow, openInboxCount, activeMemberCount }: CashflowOverviewSectionProps =
		$props();

	const transactionsBase = $derived(`/app/transactions?year=${cashflow.year}`);

	const saldoTone = $derived<'success' | 'danger' | 'default'>(
		cashflow.saldoCents > 0 ? 'success' : cashflow.saldoCents < 0 ? 'danger' : 'default',
	);
</script>

<section aria-labelledby="cashflow-heading" class="mb-8">
	<h2 id="cashflow-heading" class="sr-only">Kassenüberblick {cashflow.year}</h2>

	<!-- 2 large headline KPI cards -->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<LargeKpiCard
			label="Einnahmen YTD"
			valueInCents={cashflow.einnahmenYtdCents}
			sparklineData={cashflow.einnahmenMonthlyCents}
			lyValueInCents={cashflow.einnahmenLyYtdCents}
			tone="income"
			href={`${transactionsBase}&kind=einnahmen`}
		/>
		<LargeKpiCard
			label="Ausgaben YTD"
			valueInCents={cashflow.ausgabenYtdCents}
			sparklineData={cashflow.ausgabenMonthlyCents}
			lyValueInCents={cashflow.ausgabenLyYtdCents}
			tone="expense"
			href={`${transactionsBase}&kind=ausgaben`}
		/>
	</div>

	<!-- 4 link chips -->
	<div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
		<LinkChip
			label="Saldo"
			value={formatMoney(cashflow.saldoCents, 'auto')}
			href={transactionsBase}
			tone={saldoTone}
			ariaLabel={`Saldo ${cashflow.year}: ${formatMoney(cashflow.saldoCents, 'auto')}`}
		/>
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

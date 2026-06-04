<script lang="ts">
	import CashflowOverviewSection from '$lib/components/admin/dashboard/CashflowOverviewSection.svelte';
	import ChecklistSection from '$lib/components/admin/dashboard/ChecklistSection.svelte';
	import RecentActivity from '$lib/components/admin/dashboard/RecentActivity.svelte';
	import WGBWidget from '$lib/components/admin/dashboard/WGBWidget.svelte';
	import BeitragsuebersichtWidget from '$lib/components/admin/dashboard/BeitragsuebersichtWidget.svelte';
	import TopProjekteWidget from '$lib/components/admin/dashboard/TopProjekteWidget.svelte';
	import type { PageData } from './$types.js';
	import { navigating } from '$app/state';

	let { data }: { data: PageData } = $props();

	const greeting = $derived(() => {
		const hour = new Date().getHours();
		if (hour < 12) return 'Guten Morgen';
		if (hour < 18) return 'Guten Tag';
		return 'Guten Abend';
	});

	const displayName = $derived(() => {
		const n = data.user.name;
		if (n) return n.split(' ')[0] ?? n;
		return data.user.email.split('@')[0] ?? data.user.email;
	});

	// Year-switch keep-previous: detect when the navigation is a same-path
	// year change (only the ?year= param differs) so we can keep the previous
	// KPI numbers visible but clearly greyed while the new data loads, rather
	// than blanking the dashboard. This matches the "prior numbers visible but
	// aria-busy" spec (Task 3.4 deep-eval P2).
	//
	// Note: SvelteKit's default behaviour already keeps old page data rendered
	// until the new load completes (no blank flash) because the page component
	// is not unmounted during same-route navigations. What we add here is just
	// the subtle visual affordance (opacity-60 + aria-busy) so the user can
	// tell a refresh is in-flight.
	const isYearSwitch = $derived((): boolean => {
		const nav = navigating;
		if (!nav) return false;
		const fromPath = nav.from?.url?.pathname ?? '';
		const toPath = nav.to?.url?.pathname ?? '';
		if (fromPath !== '/app' || toPath !== '/app') return false;
		const fromYear = nav.from?.url?.searchParams?.get('year') ?? '';
		const toYear = nav.to?.url?.searchParams?.get('year') ?? '';
		return fromYear !== toYear;
	});
</script>

<div
	class="mx-auto max-w-4xl px-4 py-8 lg:px-8"
	aria-busy={isYearSwitch() ? 'true' : undefined}
	style={isYearSwitch() ? 'opacity: 0.6; transition: opacity 150ms ease-in-out;' : undefined}
>
	<!-- Greeting header -->
	<div class="mb-8">
		<h1 class="text-2xl font-bold tracking-tight text-foreground">
			{greeting()}, {displayName()} 👋
		</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Folge der Wolke e.V. · Kassenführung · {data.cashflow.year}
		</p>
	</div>

	<!-- C3 — Cashflow overview: 2 large cards + 4 sphere chips + 4 link chips
	     (cycle 1: VB-003, JB-005, UI-008, UX-330;
	      cycle 2: C3-3 sphere chips, C3-4 festschreibung lock, C3-6 Money in
	      Saldo, C3-9 "im Jahr" labels) -->
	<CashflowOverviewSection
		cashflow={data.cashflow}
		openInboxCount={data.openAuslagenCount}
		activeMemberCount={data.activeMemberCount}
		festgeschriebenBis={data.festgeschriebenBis}
	/>

	<!-- Prescriptive checklist -->
	<ChecklistSection
		openAuslagenCount={data.openAuslagenCount}
		approvedNotErstattetCount={data.approvedNotErstattetCount}
		approvedNotErstattetSumCents={data.approvedNotErstattetSumCents}
		openBeitragsMembers={data.openBeitragsMembers}
	/>

	<!-- WGB Freigrenze widget — §64 Abs. 3 AO gemeinnützigkeitsrechtliche Freigrenze -->
	<div class="mt-6">
		<WGBWidget
			einnahmenCents={data.wgb.einnahmenCents}
			freigrenzeCents={data.wgb.freigrenzeCents}
			status={data.wgb.status}
			year={data.wgb.year}
		/>
	</div>

	<!-- C4-DASH-lite: Beitragsübersicht widget (O-3/M-1) -->
	<div class="mt-6">
		<BeitragsuebersichtWidget
			year={data.beitragsuebersicht.year}
			memberCount={data.beitragsuebersicht.memberCount}
			paidCents={data.beitragsuebersicht.paidCents}
			offenCents={data.beitragsuebersicht.offenCents}
			paidMemberCount={data.beitragsuebersicht.paidMemberCount}
			openMemberCount={data.beitragsuebersicht.openMemberCount}
			overdueCount={data.beitragsuebersicht.overdueCount}
			lastPaymentDate={data.beitragsuebersicht.lastPaymentDate}
			priorYearsUnpaidCount={data.beitragsuebersicht.priorYearsUnpaidCount}
		/>
	</div>

	<!-- C1-PRJ-B/C: Top-Projekte widget — 5 most active by |saldo| -->
	<div class="mt-6">
		<TopProjekteWidget rows={data.topProjekte} />
	</div>

	<!-- Recent activity feed -->
	<RecentActivity entries={data.recentActivity} />
</div>

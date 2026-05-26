<script lang="ts">
	import CashflowOverviewSection from '$lib/components/admin/dashboard/CashflowOverviewSection.svelte';
	import ChecklistSection from '$lib/components/admin/dashboard/ChecklistSection.svelte';
	import RecentActivity from '$lib/components/admin/dashboard/RecentActivity.svelte';
	import WGBWidget from '$lib/components/admin/dashboard/WGBWidget.svelte';
	import BeitragsuebersichtWidget from '$lib/components/admin/dashboard/BeitragsuebersichtWidget.svelte';
	import TopProjekteWidget from '$lib/components/admin/dashboard/TopProjekteWidget.svelte';
	import type { PageData } from './$types.js';

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
</script>

<div class="mx-auto max-w-4xl px-4 py-8 lg:px-8">
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
		/>
	</div>

	<!-- C1-PRJ-B/C: Top-Projekte widget — 5 most active by |saldo| -->
	<div class="mt-6">
		<TopProjekteWidget rows={data.topProjekte} />
	</div>

	<!-- Recent activity feed -->
	<RecentActivity entries={data.recentActivity} />
</div>

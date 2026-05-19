<script lang="ts">
	import KpiSection from '$lib/components/admin/dashboard/KpiSection.svelte';
	import ChecklistSection from '$lib/components/admin/dashboard/ChecklistSection.svelte';
	import RecentActivity from '$lib/components/admin/dashboard/RecentActivity.svelte';
	import WGBWidget from '$lib/components/admin/dashboard/WGBWidget.svelte';
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
		<p class="mt-1 text-sm text-muted-foreground">Folge der Wolke e.V. · Kassenführung</p>
	</div>

	<!-- KPI cards row -->
	<KpiSection
		openAuslagenCount={data.openAuslagenCount}
		approvedNotErstattetCount={data.approvedNotErstattetCount}
		approvedNotErstattetSumCents={data.approvedNotErstattetSumCents}
		openBeitragsMembers={data.openBeitragsMembers}
		spendenYtdCents={data.spendenYtdCents}
		activeMemberCount={data.activeMemberCount}
	/>

	<!-- Prescriptive checklist -->
	<ChecklistSection
		openAuslagenCount={data.openAuslagenCount}
		approvedNotErstattetCount={data.approvedNotErstattetCount}
		approvedNotErstattetSumCents={data.approvedNotErstattetSumCents}
		openBeitragsMembers={data.openBeitragsMembers}
	/>

	<!-- WGB Freigrenze widget — §19 UStG Kleinunternehmer tracker -->
	<div class="mt-6">
		<WGBWidget
			einnahmenCents={data.wgb.einnahmenCents}
			freigrenzeCents={data.wgb.freigrenzeCents}
			status={data.wgb.status}
			year={data.wgb.year}
		/>
	</div>

	<!-- Recent activity feed -->
	<RecentActivity entries={data.recentActivity} />
</div>

<script lang="ts">
	import { page, navigating } from '$app/state';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import StandStrip from '$lib/components/admin/dashboard/aurora/StandStrip.svelte';
	import AufgabenCard from '$lib/components/admin/dashboard/aurora/AufgabenCard.svelte';
	import LageCard from '$lib/components/admin/dashboard/aurora/LageCard.svelte';
	import AktivitaetCard from '$lib/components/admin/dashboard/aurora/AktivitaetCard.svelte';
	import ProjekteCard from '$lib/components/admin/dashboard/aurora/ProjekteCard.svelte';
	import type { Sphere } from '$lib/domain/sphere.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// Year-switch keep-previous affordance (kept from the pre-Aurora page):
	// SvelteKit keeps old data rendered during same-route navigation; we add
	// opacity + aria-busy so the user can tell a refresh is in-flight.
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

	const SPHERE_ORDER: Sphere[] = ['ideeller', 'vermoegen', 'zweckbetrieb', 'wirtschaftlich'];
	const sphaeren = $derived(
		SPHERE_ORDER.map((s) => ({
			sphere: s,
			saldoCents:
				data.cashflow.einnahmenBySphereCents[s] - data.cashflow.ausgabenBySphereCents[s]
		}))
	);

	const taskInput = $derived({
		wgb: {
			status: data.wgb.status,
			einnahmenCents: data.wgb.einnahmenCents,
			freigrenzeCents: data.wgb.freigrenzeCents
		},
		openAuslagenCount: data.openAuslagenCount,
		approvedNotErstattetCount: data.approvedNotErstattetCount,
		approvedNotErstattetSumCents: data.approvedNotErstattetSumCents,
		overdueCount: data.beitragsuebersicht.overdueCount,
		openMemberCount: data.beitragsuebersicht.openMemberCount,
		priorYearsUnpaidCount: data.beitragsuebersicht.priorYearsUnpaidCount,
		festgeschriebenBis: data.festgeschriebenBis
	});
</script>

<svelte:head>
	<title>Übersicht – {page.data.vereinName}</title>
</svelte:head>

<PageShell width="full">
	<div
		aria-busy={isYearSwitch() ? 'true' : undefined}
		style={isYearSwitch() ? 'opacity: 0.6; transition: opacity 150ms ease-in-out;' : undefined}
	>
		<!-- Top-level document heading (visually carried by the StandStrip hero;
		     kept sr-only so the dashboard has a single h1 above the section h2s). -->
		<h1 class="sr-only">Übersicht</h1>
		<StandStrip
			saldoCents={data.cashflow.saldoCents}
			zugesagtCents={data.approvedNotErstattetSumCents}
			einnahmenCents={data.cashflow.einnahmenExclSpendenYtdCents}
			einnahmenCount={data.cashflow.einnahmenBuchungenCount}
			spendenCents={data.cashflow.spendenCashYtdCents}
			spendenCount={data.cashflow.spendenBuchungenCount}
			ausgabenCents={data.cashflow.ausgabenYtdCents}
			ausgabenCount={data.cashflow.ausgabenBuchungenCount}
			selectedYear={data.selectedYear}
			currentYear={data.currentYear}
			festgeschriebenBis={data.festgeschriebenBis}
		/>

		<!--
			Mobile stack order (spec §7): Aufgaben → Lage → Projekte → Aktivität,
			via order-N on the cards. Desktop: two INDEPENDENT column flows —
			the wrappers are display:contents on mobile (children join the outer
			flex with their order) and become real flex columns at lg.
		-->
		<div class="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start">
			<div class="contents lg:col-span-7 lg:flex lg:flex-col lg:gap-6">
				<div class="order-1 lg:order-none">
					<AufgabenCard
						input={taskInput}
						selectedYear={data.selectedYear}
						currentYear={data.currentYear}
					/>
				</div>
				<div class="order-3 lg:order-none">
					<ProjekteCard rows={data.topProjekte} />
				</div>
			</div>
			<div class="contents lg:col-span-5 lg:flex lg:flex-col lg:gap-6">
				<div class="order-2 lg:order-none">
					<LageCard
						beitraege={{
							year: data.beitragsuebersicht.year,
							memberCount: data.beitragsuebersicht.memberCount,
							exemptMemberCount: data.beitragsuebersicht.exemptMemberCount,
							paidMemberCount: data.beitragsuebersicht.paidMemberCount,
							openMemberCount: data.beitragsuebersicht.openMemberCount,
							overdueCount: data.beitragsuebersicht.overdueCount,
							paidCents: data.beitragsuebersicht.paidCents,
							offenCents: data.beitragsuebersicht.offenCents
						}}
						dimmed={data.selectedYear !== data.currentYear}
						{sphaeren}
						wgb={data.wgb}
					/>
				</div>
				<div class="order-4 lg:order-none">
					<AktivitaetCard entries={data.recentActivity} />
				</div>
			</div>
		</div>
	</div>
</PageShell>

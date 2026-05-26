<!--
  ProjectDetailHero — the masthead on /app/projekte/[id].

  Renders the project name + business-id, a colour-coded SaldoPill, a 5-up
  KPI grid (Einnahmen, Ausgaben, Saldo, Offene Rechnungen, Auslagen zu
  prüfen), and a CtaRail with the three quick-action links + an Edit button.

  Stateless — accepts a project view + its financials + an onEdit callback
  for the parent to open EditProjectDialog. Includes dark: variants.
-->
<script lang="ts">
	import ProjectKpiTile from './ProjectKpiTile.svelte';
	import ProjectCtaRail from './ProjectCtaRail.svelte';
	import SaldoPill from './SaldoPill.svelte';
	import type {
		ProjectView,
		ProjectFinancials,
	} from '$lib/server/domain/projects.js';

	let {
		project,
		financials,
		onEdit,
	}: {
		project: ProjectView;
		financials: ProjectFinancials;
		onEdit: () => void;
	} = $props();

	const fmt = (c: number) =>
		(c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
</script>

<header
	class="rounded-xl border border-border bg-card p-5 shadow-sm dark:border-border/60 dark:bg-card/40"
	data-testid="project-detail-hero"
>
	<div class="mb-4 flex flex-wrap items-baseline gap-3">
		<h1 class="text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>
		<span class="font-mono text-xs text-muted-foreground">{project.businessId}</span>
		<SaldoPill saldoCents={financials.saldoCents} />
	</div>

	<div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
		<ProjectKpiTile label="Einnahmen" value={fmt(financials.einnahmenCents)} />
		<ProjectKpiTile label="Ausgaben" value={fmt(financials.ausgabenCents)} />
		<ProjectKpiTile label="Saldo" value={fmt(financials.saldoCents)} />
		<ProjectKpiTile
			label="Offene Rechnungen"
			value={String(financials.offeneRechnungen)}
		/>
		<ProjectKpiTile
			label="Auslagen zu prüfen"
			value={String(financials.auslagenZuPruefen)}
		/>
	</div>

	<div class="mt-4">
		<ProjectCtaRail projectId={project.id} {onEdit} />
	</div>
</header>

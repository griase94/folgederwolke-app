<!--
  ProjectDetailHero — the masthead on /app/projekte/[id].

  Renders the project name + business-id, a colour-coded SaldoPill, a 5-up
  StatCard strip (Einnahmen, Ausgaben, Saldo, Offene Rechnungen, Auslagen zu
  prüfen), and a CtaRail with the three quick-action links + an Edit button.

  Stateless — accepts a project view + its financials + an onEdit callback
  for the parent to open EditProjectDialog.

  Spec §8 M4: the local ProjectKpiTile is gone — this hero uses the one
  StatCard family. That also drops the hand-rolled EUR formatter, which
  emitted an ASCII hyphen on negatives where the rest of the app emits a real
  U+2212 minus. Einnahmen/Ausgaben keep their identity hue; Saldo and the two
  counts are neutral metrics and wear the neutral dot.
-->
<script lang="ts">
	import ProjectCtaRail from './ProjectCtaRail.svelte';
	import SaldoPill from './SaldoPill.svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { StatCard, StatCardStrip } from '$lib/components/ui/stat-card/index.js';
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
</script>

<header
	class="rounded-xl border border-border bg-card p-6 shadow-sm"
	data-testid="project-detail-hero"
>
	<div class="mb-4 flex flex-wrap items-baseline gap-3">
		<h1 class="text-2xl font-semibold tracking-[-0.02em] text-ink-900">{project.name}</h1>
		<span class="font-mono text-xs text-muted-foreground">{project.businessId}</span>
		<SaldoPill saldoCents={financials.saldoCents} />
	</div>

	<StatCardStrip label="Projekt-Kennzahlen">
		<StatCard
			label="Einnahmen"
			format="money"
			value={formatMoney(financials.einnahmenCents)}
			accentClass="bg-type-einnahme"
			empty={financials.einnahmenCents === 0}
			data-kpi-label="Einnahmen"
		/>
		<StatCard
			label="Ausgaben"
			format="money"
			value={formatMoney(financials.ausgabenCents)}
			accentClass="bg-type-ausgabe"
			empty={financials.ausgabenCents === 0}
			data-kpi-label="Ausgaben"
		/>
		<StatCard
			label="Saldo"
			format="money"
			value={formatMoney(financials.saldoCents)}
			empty={financials.saldoCents === 0}
			data-kpi-label="Saldo"
		/>
		<StatCard
			label="Offene Rechnungen"
			format="count"
			value={String(financials.offeneRechnungen)}
			empty={financials.offeneRechnungen === 0}
			data-kpi-label="Offene Rechnungen"
		/>
		<StatCard
			label="Auslagen zu prüfen"
			format="count"
			value={String(financials.auslagenZuPruefen)}
			empty={financials.auslagenZuPruefen === 0}
			data-kpi-label="Auslagen zu prüfen"
		/>
	</StatCardStrip>

	<div class="mt-4">
		<ProjectCtaRail projectId={project.id} {onEdit} />
	</div>
</header>

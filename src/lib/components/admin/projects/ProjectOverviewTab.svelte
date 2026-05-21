<!--
  ProjectOverviewTab — "Übersicht" tab content on the project detail page.

  Three master-data blocks: Notizen, Laufzeit, Standard-Sphäre. Stateless.
  Scope-guard reminder: this is the ONLY tab beyond ProjectTransactionsTab
  that ships in C1-PRJ-A Phase 1. Rechnungen/Auslagen/Belege/Verlauf tabs
  are Night-2 C1-PRJ-B/C work.
-->
<script lang="ts">
	import type {
		ProjectView,
		ProjectFinancials,
	} from '$lib/server/domain/projects.js';

	let {
		project,
	}: {
		project: ProjectView;
		// Financials is accepted for parity with siblings but not yet rendered
		// here — kept on the API so Night-2 widgets (e.g. saldo trend chart)
		// don't break the call signature.
		financials: ProjectFinancials;
	} = $props();
</script>

<section class="space-y-4" data-testid="project-overview-tab">
	<div
		class="rounded-xl border border-border bg-card p-4 dark:border-border/60 dark:bg-card/40"
	>
		<h2 class="mb-2 text-sm font-semibold text-foreground">Notizen</h2>
		<p class="whitespace-pre-wrap text-sm text-muted-foreground">
			{project.notes ?? '—'}
		</p>
	</div>
	<div
		class="rounded-xl border border-border bg-card p-4 dark:border-border/60 dark:bg-card/40"
	>
		<h2 class="mb-2 text-sm font-semibold text-foreground">Laufzeit</h2>
		<p class="text-sm text-muted-foreground tabular-nums">
			{project.startDate ?? '—'} bis {project.endDate ?? '—'}
		</p>
	</div>
	<div
		class="rounded-xl border border-border bg-card p-4 dark:border-border/60 dark:bg-card/40"
	>
		<h2 class="mb-2 text-sm font-semibold text-foreground">Standard-Sphäre</h2>
		<p class="text-sm text-muted-foreground">
			{project.sphereDefault ?? '— (folgt der Kategorie)'}
		</p>
	</div>
</section>

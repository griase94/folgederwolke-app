<!--
  ProjectCtaRail — three quick-action links + an "Edit" button on the
  ProjectDetailHero. The links carry `?projectId=X&from=projekt` so the
  destination route can prefill + return-to-projekt with a toast.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	let {
		projectId,
		onEdit,
	}: { projectId: string; onEdit: () => void } = $props();
</script>

<div class="flex flex-wrap items-center gap-2" data-testid="project-cta-rail">
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<Button
		href={`/app/rechnungen/new?projectId=${projectId}&from=projekt`}
		data-testid="project-cta"
		data-cta-label="+Rechnung"
	>
		+Rechnung
	</Button>
	<Button
		href={`/app/transactions/neu?kind=einnahme&projectId=${projectId}&from=projekt`}
		data-testid="project-cta"
		data-cta-label="+Einnahme"
	>
		+Einnahme
	</Button>
	<Button
		href={`/app/transactions/neu?kind=ausgabe&projectId=${projectId}&from=projekt`}
		data-testid="project-cta"
		data-cta-label="+Ausgabe"
	>
		+Ausgabe
	</Button>
	<Button variant="outline" onclick={onEdit} data-testid="project-cta-edit">
		Bearbeiten
	</Button>
</div>

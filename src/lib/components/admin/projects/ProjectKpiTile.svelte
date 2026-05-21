<!--
  ProjectKpiTile — single number/label tile, used in the 5-up KPI grid on
  the ProjectDetailHero. Stateless. Includes dark: variants.
-->
<script lang="ts">
	let {
		label,
		value,
		hint,
	}: { label: string; value: string; hint?: string } = $props();
</script>

<div
	class="rounded-xl border border-border bg-card p-4 shadow-sm dark:border-border/60 dark:bg-card/40"
	data-testid="project-kpi-tile"
	data-kpi-label={label}
>
	<p class="text-xs font-medium text-muted-foreground">{label}</p>
	<p class="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
		{value}
	</p>
	{#if hint}
		<p class="mt-0.5 text-xs text-muted-foreground">{hint}</p>
	{/if}
</div>

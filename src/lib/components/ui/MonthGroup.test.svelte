<script lang="ts">
	import MonthGroup from './MonthGroup.svelte';

	let { label = 'Mai 2026', subtotalCents = undefined }: { label?: string; subtotalCents?: number } =
		$props();
</script>

<MonthGroup {label} {subtotalCents}>
	<p data-testid="group-row">Zeile</p>
</MonthGroup>

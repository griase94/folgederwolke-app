<script lang="ts">
	import StatCard from './StatCard.svelte';
	import StatCardStrip from './StatCardStrip.svelte';
	import type { StatCardStripOrientation } from './StatCardStrip.svelte';

	let {
		orientation = 'horizontal',
		label
	}: { orientation?: StatCardStripOrientation; label?: string } = $props();
</script>

<StatCardStrip {orientation} {label}>
	<StatCard label="Summe" format="money" value="1.250,00 €" accentClass="bg-type-einnahme" />
	<StatCard label="Rest" format="money" value="0,00 €" empty />
</StatCardStrip>

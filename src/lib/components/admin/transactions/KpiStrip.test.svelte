<script lang="ts">
	import KpiStrip from './KpiStrip.svelte';

	let { dataSlot }: { dataSlot?: string } = $props();
</script>

<KpiStrip data-slot={dataSlot}>
	<div data-testid="strip-child">A</div>
	<div data-testid="strip-child">B</div>
</KpiStrip>

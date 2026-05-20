<script lang="ts">
	import FabBottomSheet from './FabBottomSheet.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<FabBottomSheet bind:open />

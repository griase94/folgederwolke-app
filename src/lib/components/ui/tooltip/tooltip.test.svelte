<script lang="ts">
	import * as Tooltip from "./index.js";
</script>

<Tooltip.Provider delayDuration={0} disableHoverableContent={true}>
	<Tooltip.Root delayDuration={0}>
		<Tooltip.Trigger>hover me</Tooltip.Trigger>
		<Tooltip.Content>Hinweis</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>

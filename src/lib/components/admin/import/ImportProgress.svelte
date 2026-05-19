<!--
  ImportProgress — minimal loading indicator for in-flight import operations.

  Shows a spinner + message while the dry-run or apply action is pending.
-->
<script lang="ts">
	interface Props {
		message?: string;
	}

	let { message = 'Verarbeite...' }: Props = $props();
</script>

<div class="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
	<!-- Spinner -->
	<svg
		class="h-4 w-4 animate-spin text-pink-600"
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		aria-hidden="true"
	>
		<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
		></circle>
		<path
			class="opacity-75"
			fill="currentColor"
			d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
		></path>
	</svg>
	<span>{message}</span>
</div>

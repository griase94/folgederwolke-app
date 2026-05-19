<script lang="ts">
	import EmptyState from "./empty-state.svelte";

	let {
		title,
		description,
		withCta = false,
		withIcon = false,
	}: {
		title: string;
		description?: string;
		withCta?: boolean;
		withIcon?: boolean;
	} = $props();
</script>

<EmptyState {title} {description}>
	{#snippet icon()}
		{#if withIcon}
			<svg width="40" height="40"><circle cx="20" cy="20" r="10" /></svg>
		{/if}
	{/snippet}
	{#snippet cta()}
		{#if withCta}
			<button>Create one</button>
		{/if}
	{/snippet}
</EmptyState>

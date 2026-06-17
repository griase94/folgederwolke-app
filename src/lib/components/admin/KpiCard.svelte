<script lang="ts">
	interface Props {
		label: string;
		value: string;
		href?: string;
		sublabel?: string;
	}

	let { label, value, href, sublabel }: Props = $props();
</script>

{#if href}
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		{href}
		class="group block rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<p class="text-sm font-medium text-muted-foreground">{label}</p>
		<p class="mt-1 text-2xl font-bold tracking-tight text-foreground group-hover:text-primary">
			{value}
		</p>
		{#if sublabel}
			<p class="mt-1 text-xs text-muted-foreground">{sublabel}</p>
		{/if}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
	<div class="rounded-xl border border-border bg-card p-5 shadow-sm">
		<p class="text-sm font-medium text-muted-foreground">{label}</p>
		<p class="mt-1 text-2xl font-bold tracking-tight text-foreground">{value}</p>
		{#if sublabel}
			<p class="mt-1 text-xs text-muted-foreground">{sublabel}</p>
		{/if}
	</div>
{/if}

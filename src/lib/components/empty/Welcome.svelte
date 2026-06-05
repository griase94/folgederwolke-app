<!--
  Welcome — first-run empty state for a freshly set-up workspace.
  Shows a friendly onboarding message with the app name + a CTA.
  Used on the dashboard or inbox when there is literally nothing yet.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';

	let {
		heading,
		body,
		action
	}: {
		heading?: string;
		body?: string;
		action?: Snippet;
	} = $props();

	// White-label: default the first-run heading to the runtime Verein name
	// (from the root layout) instead of a hardcoded literal. An explicit
	// `heading` prop still overrides.
	const effectiveHeading = $derived(heading ?? `Willkommen bei ${page.data.vereinName}`);
</script>

<div class="flex flex-col items-center gap-6 px-6 py-24 text-center">
	<!-- Rosa cloud icon -->
	<div
		class="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
		aria-hidden="true"
	>
		<svg
			class="h-10 w-10 text-primary"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="1.5"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
			/>
		</svg>
	</div>

	<div class="max-w-sm">
		<h2 class="text-xl font-bold tracking-tight text-foreground">{effectiveHeading}</h2>
		{#if body}
			<p class="mt-2 text-sm text-muted-foreground">{body}</p>
		{/if}
	</div>

	{#if action}
		<div>{@render action()}</div>
	{/if}
</div>

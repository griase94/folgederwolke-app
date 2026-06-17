<!--
  PageHeader — Aurora header anatomy (master §2.3 FROZEN contract, spec §4):
  title row → meta line → ONE toolbar row (search + filter chips together).

  On mobile DETAIL routes the header gains a leading back slot (chevron +
  parent label) — iOS standalone PWA has no browser chrome. The back slot
  renders ONLY when backHref is set, and only below md. Callers must pass
  the full parent href INCLUDING the originating list's query params.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		backHref,
		backLabel,
		meta,
		toolbar
	}: {
		title: string;
		backHref?: string;
		backLabel?: string;
		meta?: Snippet;
		toolbar?: Snippet;
	} = $props();
</script>

<header data-page-header class="mb-6 flex flex-col gap-3">
	{#if backHref}
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={backHref}
			data-testid="page-header-back"
			class="-ml-1 flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:hidden"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M15 18l-6-6 6-6" />
			</svg>
			<span>{backLabel ?? 'Zurück'}</span>
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/if}

	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold tracking-[-0.02em] text-ink-900">{title}</h1>
		{#if meta}
			<div class="text-sm text-ink-500">{@render meta()}</div>
		{/if}
	</div>

	{#if toolbar}
		<div class="flex flex-wrap items-center gap-2">{@render toolbar()}</div>
	{/if}
</header>

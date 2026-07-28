<script lang="ts">
	import { page } from '$app/state';
	import WorkspaceTabs from '$lib/components/admin/jahresabschluss/WorkspaceTabs.svelte';
	import type { LayoutData } from './$types.js';
	import type { Snippet } from 'svelte';

	let {
		data,
		children
	}: { data: LayoutData; children: Snippet } = $props();
</script>

<svelte:head>
	<title>Jahresabschluss {data.year} – {page.data.vereinName}</title>
</svelte:head>

<!--
  Workspace chrome (§3b "roter Faden"): breadcrumb + title + Festgeschrieben-
  Callout + tabs live HERE, in the [year] layout — all four tabs (Übersicht ·
  Buchungsliste · Spenden · Exports) inherit them from one place. Each tab page
  owns its own <PageShell> for the body, aligned to this chrome's max-width.
  D5a: no download buttons here — every export lives on the Exports tab.
-->
<div class="mx-auto w-full max-w-[1100px] px-4 pt-6 sm:px-6 md:pt-8 lg:px-8">
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<nav class="mb-3" aria-label="Brotkrumen">
		<a
			href="/app/jahresabschluss"
			class="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
			data-testid="workspace-breadcrumb"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="15"
				height="15"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.25"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="m15 18-6-6 6-6" />
			</svg>
			Jahresabschluss
		</a>
	</nav>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->

	<div class="mb-4">
		<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
			Buchungsjahr {data.year}
		</p>
		<h1 class="mt-0.5 text-2xl font-bold tracking-tight text-foreground">
			Jahresabschluss {data.year}
		</h1>
	</div>

	{#if data.closed}
		<!-- Festgeschrieben — der ruhige Info-Callout (nie Amber, T18c). Ein Ort,
		     alle vier Tabs zeigen ihn identisch. -->
		<div
			class="mb-4 flex items-start gap-2.5 rounded-[10px] border border-severity-info/40 bg-severity-info/10 px-4 py-3 text-sm text-ink-700"
			role="status"
			data-testid="festgeschrieben-callout"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="17"
				height="17"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="mt-0.5 flex-none text-severity-info"
				aria-hidden="true"
			>
				<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
				<path d="M7 11V7a5 5 0 0 1 10 0v4" />
			</svg>
			<p>
				Buchungsjahr {data.year} ist <b class="font-semibold">festgeschrieben</b> — die Zahlen
				sind endgültig.
			</p>
		</div>
	{/if}

	<WorkspaceTabs tabs={data.tabs} activePath={page.url.pathname} />
</div>

{@render children()}

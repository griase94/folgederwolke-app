<script lang="ts">
	import { page } from '$app/state';
	import { PageHeader } from '$lib/components/ui/page-header/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
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

<div class="mx-auto max-w-6xl px-4 py-6 safe-top lg:px-8 lg:py-8">
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<!-- Breadcrumb back-link (kept simple — matches existing pattern) -->
	<div class="mb-3">
		<a
			href="/app/jahresabschluss"
			class="text-sm text-muted-foreground hover:text-foreground"
			aria-label="Zurück zur Jahresabschluss-Übersicht"
		>
			← Jahresabschluss
		</a>
	</div>

	<PageHeader
		eyebrow={`Buchungsjahr ${data.year}`}
		heading={`Jahresabschluss ${data.year}`}
		description={`${data.vereinName}${data.closed ? ' · Festgeschrieben' : ''}`}
	>
		{#snippet actions()}
			<!-- Prominent PDF + CSV + ZIP at the top per UI-002 fix -->
			<Button
				href={`/app/jahresabschluss/${data.year}/bundle.zip`}
				data-testid="header-action-bundle"
				class="bg-primary text-primary-foreground hover:bg-primary/90"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" y1="15" x2="12" y2="3" />
				</svg>
				<span class="ml-2">Steuerberater-Paket (ZIP)</span>
			</Button>
		{/snippet}
	</PageHeader>

	<WorkspaceTabs tabs={data.tabs} activePath={page.url.pathname} />

	<div class="safe-bottom">
		{@render children()}
	</div>
</div>

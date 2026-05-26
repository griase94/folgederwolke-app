<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types.js';
	import ProjectDetailHero from '$lib/components/admin/projects/ProjectDetailHero.svelte';
	import ProjectOverviewTab from '$lib/components/admin/projects/ProjectOverviewTab.svelte';
	import ProjectTransactionsTab from '$lib/components/admin/projects/ProjectTransactionsTab.svelte';
	import EditProjectDialog from '$lib/components/admin/projects/EditProjectDialog.svelte';

	let { data }: { data: PageData } = $props();

	type Tab = 'uebersicht' | 'transaktionen';
	let activeTab = $state<Tab>('uebersicht');

	let editOpen = $state(false);
	function onEdit() {
		editOpen = true;
	}

	// C1-PRJ-A: surface the redirect-back-with-toast payload set by
	// /rechnungen/new after `?from=projekt` save.
	onMount(() => {
		if (!data.toast) return;
		const fn =
			data.toast.kind === 'error'
				? toast.error
				: data.toast.kind === 'info'
					? toast.info
					: toast.success;
		fn(data.toast.message);
	});
</script>

<svelte:head>
	<title>{data.project.name} – Projekt – Folge der Wolke</title>
</svelte:head>

<main class="container mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<!-- Breadcrumb -->
	<nav
		class="flex items-center gap-2 text-sm text-muted-foreground"
		aria-label="Brotkrümel"
	>
		<a
			href="/app/projekte"
			class="flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<svg
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15 19l-7-7 7-7"
				/>
			</svg>
			Projekte
		</a>
		<span aria-hidden="true">/</span>
		<span class="truncate font-medium text-foreground">{data.project.name}</span>
	</nav>

	<ProjectDetailHero
		project={data.project}
		financials={data.financials}
		{onEdit}
	/>

	<nav class="flex gap-2 border-b border-border" aria-label="Projekt-Tabs">
		<button
			type="button"
			onclick={() => (activeTab = 'uebersicht')}
			class={[
				'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
				activeTab === 'uebersicht'
					? 'border-primary text-foreground'
					: 'border-transparent text-muted-foreground hover:text-foreground',
			].join(' ')}
			data-testid="project-tab"
			data-tab="uebersicht"
			aria-pressed={activeTab === 'uebersicht'}
		>
			Übersicht
		</button>
		<button
			type="button"
			onclick={() => (activeTab = 'transaktionen')}
			class={[
				'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
				activeTab === 'transaktionen'
					? 'border-primary text-foreground'
					: 'border-transparent text-muted-foreground hover:text-foreground',
			].join(' ')}
			data-testid="project-tab"
			data-tab="transaktionen"
			aria-pressed={activeTab === 'transaktionen'}
		>
			Transaktionen
		</button>
	</nav>

	{#if activeTab === 'uebersicht'}
		<ProjectOverviewTab project={data.project} financials={data.financials} />
	{:else if activeTab === 'transaktionen'}
		<ProjectTransactionsTab rows={data.transactions} />
	{/if}
</main>

<EditProjectDialog
	bind:open={editOpen}
	project={data.project}
	customers={data.customers}
/>

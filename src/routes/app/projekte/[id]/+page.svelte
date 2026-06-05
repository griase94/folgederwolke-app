<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types.js';
	import ProjectDetailHero from '$lib/components/admin/projects/ProjectDetailHero.svelte';
	import ProjectOverviewTab from '$lib/components/admin/projects/ProjectOverviewTab.svelte';
	import ProjectTransactionsTab from '$lib/components/admin/projects/ProjectTransactionsTab.svelte';
	import ProjectRechnungenTab from '$lib/components/admin/projects/ProjectRechnungenTab.svelte';
	import ProjectAuslagenTab from '$lib/components/admin/projects/ProjectAuslagenTab.svelte';
	import ProjectBelegeTab from '$lib/components/admin/projects/ProjectBelegeTab.svelte';
	import ProjectVerlaufTab from '$lib/components/admin/projects/ProjectVerlaufTab.svelte';
	import SphereOverrideBanner from '$lib/components/admin/projects/SphereOverrideBanner.svelte';
	import EditProjectDialog from '$lib/components/admin/projects/EditProjectDialog.svelte';

	let { data }: { data: PageData } = $props();

	type Tab = 'uebersicht' | 'transaktionen' | 'rechnungen' | 'auslagen' | 'belege' | 'verlauf';
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

	const tabs: Array<{ id: Tab; label: string }> = [
		{ id: 'uebersicht', label: 'Übersicht' },
		{ id: 'transaktionen', label: 'Transaktionen' },
		{ id: 'rechnungen', label: 'Rechnungen' },
		{ id: 'auslagen', label: 'Auslagen' },
		{ id: 'belege', label: 'Belege' },
		{ id: 'verlauf', label: 'Verlauf' },
	];
</script>

<svelte:head>
	<title>{data.project.name} – Projekt – {page.data.vereinName}</title>
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

	<!-- ADR-0008: sphere override banner — shown when project overrides category sphere -->
	<SphereOverrideBanner sphereDefault={data.project.sphereDefault ?? null} />

	<nav class="flex gap-2 overflow-x-auto border-b border-border" aria-label="Projekt-Tabs">
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				onclick={() => (activeTab = tab.id)}
				class={[
					'border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors',
					activeTab === tab.id
						? 'border-primary text-foreground'
						: 'border-transparent text-muted-foreground hover:text-foreground',
				].join(' ')}
				data-testid="project-tab"
				data-tab={tab.id}
				aria-pressed={activeTab === tab.id}
			>
				{tab.label}
			</button>
		{/each}
	</nav>

	{#if activeTab === 'uebersicht'}
		<ProjectOverviewTab project={data.project} financials={data.financials} />
	{:else if activeTab === 'transaktionen'}
		<ProjectTransactionsTab rows={data.transactions} />
	{:else if activeTab === 'rechnungen'}
		<ProjectRechnungenTab rechnungen={data.rechnungen} />
	{:else if activeTab === 'auslagen'}
		<ProjectAuslagenTab auslagen={data.auslagen} />
	{:else if activeTab === 'belege'}
		<ProjectBelegeTab belege={data.belege} />
	{:else if activeTab === 'verlauf'}
		<ProjectVerlaufTab events={data.verlauf} />
	{/if}
</main>

<EditProjectDialog
	bind:open={editOpen}
	project={data.project}
	customers={data.customers}
/>

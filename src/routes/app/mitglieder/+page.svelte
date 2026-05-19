<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import MemberList from '$lib/components/admin/members/MemberList.svelte';
	import MemberMatrix from '$lib/components/admin/members/MemberMatrix.svelte';
	import AddMemberDialog from '$lib/components/admin/members/AddMemberDialog.svelte';
	import EditMemberDialog from '$lib/components/admin/members/EditMemberDialog.svelte';
	import type { MemberView } from '$lib/domain/members.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let addOpen = $state(false);
	let editOpen = $state(false);
	let editMember = $state<MemberView | null>(null);

	let searchQuery = $state('');

	const filteredMembers = $derived(
		searchQuery.trim().length === 0
			? data.members
			: data.members.filter((m) => {
					const q = searchQuery.trim().toLowerCase();
					return (
						m.vorname.toLowerCase().includes(q) ||
						m.nachname.toLowerCase().includes(q) ||
						(m.email?.toLowerCase().includes(q) ?? false)
					);
				})
	);

	function setView(v: 'list' | 'matrix') {
		const u = new URL(page.url);
		if (v === 'list') {
			u.searchParams.delete('view');
		} else {
			u.searchParams.set('view', 'matrix');
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(u.toString(), { replaceState: true });
	}

	function openEdit(m: MemberView) {
		editMember = m;
		editOpen = true;
	}
</script>

<svelte:head>
	<title>Mitglieder – Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-8 sm:px-6">
	<!-- Header -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground">Mitglieder</h1>
			<p class="mt-0.5 text-sm text-muted-foreground">
				{data.members.length}
				{data.members.length === 1 ? 'Mitglied' : 'Mitglieder'}
			</p>
		</div>
		<Button
			onclick={() => (addOpen = true)}
			class="bg-primary text-primary-foreground hover:bg-primary/90"
		>
			<svg
				class="mr-2 h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			Mitglied hinzufügen
		</Button>
	</div>

	<!-- Controls: search + view toggle -->
	<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<!-- Search (list view only) -->
		{#if data.view === 'list'}
			<div class="relative w-full sm:max-w-xs">
				<svg
					class="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<circle cx="11" cy="11" r="8" />
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35" />
				</svg>
				<input
					type="search"
					placeholder="Suchen…"
					bind:value={searchQuery}
					aria-label="Mitglieder suchen"
					class="border-input focus-visible:ring-ring/50 h-8 w-full rounded-lg border bg-transparent py-1 pl-8 pr-3 text-base focus-visible:outline-none focus-visible:ring-2 sm:text-sm"
				/>
			</div>
		{:else}
			<div></div>
		{/if}

		<!-- View toggle -->
		<div
			class="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/50 p-0.5"
			role="radiogroup"
			aria-label="Ansicht wählen"
		>
			<button
				type="button"
				role="radio"
				aria-checked={data.view === 'list'}
				onclick={() => setView('list')}
				class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors {data.view ===
				'list'
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<svg
					class="h-3.5 w-3.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
				Liste
			</button>
			<button
				type="button"
				role="radio"
				aria-checked={data.view === 'matrix'}
				onclick={() => setView('matrix')}
				class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors {data.view ===
				'matrix'
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'}"
			>
				<svg
					class="h-3.5 w-3.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<rect x="3" y="3" width="7" height="7" rx="1" />
					<rect x="14" y="3" width="7" height="7" rx="1" />
					<rect x="3" y="14" width="7" height="7" rx="1" />
					<rect x="14" y="14" width="7" height="7" rx="1" />
				</svg>
				Beitrags-Matrix
			</button>
		</div>
	</div>

	<!-- Main view -->
	{#if data.view === 'matrix'}
		<MemberMatrix members={filteredMembers} years={data.years} />
	{:else}
		<MemberList
			members={filteredMembers}
			years={data.years}
			onEdit={openEdit}
			onAdd={() => (addOpen = true)}
		/>
	{/if}
</div>

<AddMemberDialog bind:open={addOpen} />
<EditMemberDialog bind:open={editOpen} member={editMember} />

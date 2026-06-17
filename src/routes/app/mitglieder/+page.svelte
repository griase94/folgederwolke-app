<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { deserialize } from '$app/forms';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button/index.js';
	import MemberList from '$lib/components/admin/members/MemberList.svelte';
	import MemberMatrix from '$lib/components/admin/members/MemberMatrix.svelte';
	import AddMemberDialog from '$lib/components/admin/members/AddMemberDialog.svelte';
	import EditMemberDialog from '$lib/components/admin/members/EditMemberDialog.svelte';
	import { beitragStatusFor, type MemberView } from '$lib/domain/members.js';
	import { berlinYmd, currentBuchungsjahr, clampYearToAvailable } from '$lib/domain/year.js';
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

	// ── Bulk "Als bezahlt markieren" (Mitglieder list multi-select) ──────────────
	let selectMode = $state(false);
	let bulkSubmitting = $state(false);
	const selectedIds = new SvelteSet<string>();
	// Bulk target year = current Buchungsjahr, clamped to the visible window.
	let bulkDate = $state(berlinYmd());
	const bulkYear = $derived(
		data.years.length > 0 ? clampYearToAvailable(currentBuchungsjahr(), data.years) : null
	);

	function toggleSelect(id: string, checked: boolean) {
		if (checked) selectedIds.add(id);
		else selectedIds.delete(id);
	}

	function exitSelectMode() {
		selectMode = false;
		selectedIds.clear();
	}

	// Members in the current filtered view that can be bulk-marked for bulkYear
	// (open, non-exempt, active) — drives "Alle auswählen".
	const selectableMembers = $derived(
		bulkYear === null
			? []
			: filteredMembers.filter((m) => {
					if (m.beitragExempt || m.austrittsDatum) return false;
					const b = m.beitrags[bulkYear];
					return (b ? beitragStatusFor(b) : 'open') === 'open';
				})
	);
	const allSelectableSelected = $derived(
		selectableMembers.length > 0 && selectableMembers.every((m) => selectedIds.has(m.id))
	);

	function toggleSelectAll() {
		if (allSelectableSelected) {
			selectedIds.clear();
		} else {
			for (const m of selectableMembers) selectedIds.add(m.id);
		}
	}

	async function submitBulkPaid() {
		if (bulkSubmitting || bulkYear === null || selectedIds.size === 0) return;
		bulkSubmitting = true;
		try {
			const fd = new FormData();
			for (const id of selectedIds) fd.append('memberId', id);
			fd.set('year', String(bulkYear));
			fd.set('gezahltAm', bulkDate);
			const res = await fetch('?/mark-beitrag-paid-bulk', { method: 'POST', body: fd });
			const result = deserialize(await res.text());
			if (result.type === 'success') {
				const d = result.data as { paidCount?: number; skippedCount?: number } | undefined;
				const paid = d?.paidCount ?? 0;
				const skipped = d?.skippedCount ?? 0;
				toast.success(
					`${paid} ${paid === 1 ? 'Beitrag' : 'Beiträge'} für ${bulkYear} als bezahlt markiert` +
						(skipped > 0 ? ` (${skipped} übersprungen)` : '')
				);
				exitSelectMode();
				await invalidateAll();
			} else if (result.type === 'failure') {
				toast.error(
					(result.data?.['error'] as string | undefined) ?? 'Sammel-Aktion fehlgeschlagen.'
				);
			} else {
				toast.error('Sammel-Aktion fehlgeschlagen.');
			}
		} catch {
			toast.error('Sammel-Aktion fehlgeschlagen.');
		} finally {
			bulkSubmitting = false;
		}
	}

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
	<title>Mitglieder – {page.data.vereinName}</title>
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
			class="bg-primary-strong text-primary-foreground hover:bg-primary-strong/90"
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

	<!-- Bulk-select control bar (list view only). On a phone this lives in the
	     desktop row list, so the toggle is hidden < md to match. -->
	{#if data.view === 'list' && data.members.length > 0}
		<div class="mb-3 hidden items-center justify-between gap-3 md:flex">
			{#if !selectMode}
				<button
					type="button"
					onclick={() => (selectMode = true)}
					data-testid="members-bulk-toggle"
					class="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					Auswählen
				</button>
			{:else}
				<div
					class="flex w-full flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5"
					role="region"
					aria-label="Sammel-Aktion"
				>
					<label class="inline-flex items-center gap-2 text-sm font-medium text-foreground">
						<input
							type="checkbox"
							checked={allSelectableSelected}
							onchange={toggleSelectAll}
							disabled={selectableMembers.length === 0}
							class="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						Alle offenen{bulkYear !== null ? ` (${bulkYear})` : ''}
					</label>
					<span class="text-sm text-muted-foreground" aria-live="polite">
						{selectedIds.size} ausgewählt
					</span>
					<div class="ml-auto flex flex-wrap items-center gap-2">
						<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
							<span>Bezahlt am</span>
							<input
								type="date"
								lang="de"
								bind:value={bulkDate}
								disabled={bulkSubmitting}
								class="min-h-9 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:bg-input/30"
							/>
						</label>
						<Button
							onclick={submitBulkPaid}
							disabled={bulkSubmitting || bulkYear === null || selectedIds.size === 0}
							data-testid="members-bulk-pay"
						>
							Als bezahlt markieren
						</Button>
						<Button variant="ghost" onclick={exitSelectMode} disabled={bulkSubmitting}>
							Abbrechen
						</Button>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Main view -->
	{#if data.view === 'matrix'}
		<MemberMatrix matrix={data.matrix} filter={data.filter} />
	{:else}
		<MemberList
			members={filteredMembers}
			years={data.years}
			query={searchQuery}
			selectable={selectMode}
			{selectedIds}
			{bulkYear}
			satzByYear={data.satzByYear}
			onToggleSelect={toggleSelect}
			onEdit={openEdit}
			onAdd={() => (addOpen = true)}
			onClearSearch={() => (searchQuery = '')}
		/>
	{/if}
</div>

<AddMemberDialog bind:open={addOpen} />
<EditMemberDialog bind:open={editOpen} member={editMember} />

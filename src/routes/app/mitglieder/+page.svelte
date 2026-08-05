<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { TOOLBAR_CONTROL } from '$lib/components/ui/list-toolbar/index.js';
	import { deserialize } from '$app/forms';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import MemberList from '$lib/components/admin/members/MemberList.svelte';
	import MemberMatrix from '$lib/components/admin/members/MemberMatrix.svelte';
	import MemberDialog from '$lib/components/admin/members/MemberDialog.svelte';
	import SendReminderBulkSheet from '$lib/components/admin/members/SendReminderBulkSheet.svelte';
	import BulkMarkBar from '$lib/components/admin/members/BulkMarkBar.svelte';
	import type { MemberView } from '$lib/domain/members.js';
	import type { ReminderCandidate } from '$lib/domain/reminder-candidate.js';
	import { projectForList } from '$lib/domain/beitrag-state.js';
	import { berlinYmd, currentBuchungsjahr, clampYearToAvailable } from '$lib/domain/year.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// Single source of beitrag state: the matrix cells, keyed `${memberId}:${year}`.
	// The list pills + bulk-select gate read from here — no parallel re-derivation.
	const cellMap = $derived(
		new Map(data.matrix.cells.map((c) => [`${c.memberId}:${c.year}`, c]))
	);

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
					const cell = cellMap.get(`${m.id}:${bulkYear}`);
					// Owing = open (incl. overdue, folded by projectForList) or partial;
					// festgeschriebene cells are read-only. Same gate as the MemberRow
					// checkbox and the Matrix isBulkEligible so all three agree.
					if (!cell || cell.isLocked) return false;
					const proj = projectForList(cell.state);
					return proj === 'open' || proj === 'partial';
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

	// ── Reminder sheet (toolbar bulk + row/matrix ghost n=1) ─────────────────────
	// The consolidated surface (C2/S3b): the toolbar opens it with ALL candidates;
	// a row-kebab / matrix-cell ghost opens the SAME sheet pre-filtered to that one
	// member (single = n=1). `reminderSubset=null` means "all".
	let reminderOpen = $state(false);
	let reminderSubset = $state<ReminderCandidate[] | null>(null);
	const reminderSelectableCount = $derived(
		data.reminderCandidates.filter((c) => c.selectable).length
	);

	function openReminderAll() {
		reminderSubset = null;
		reminderOpen = true;
	}
	function openReminderFor(memberId: string) {
		const c = data.reminderCandidates.find((x) => x.memberId === memberId);
		reminderSubset = c ? [c] : null;
		reminderOpen = true;
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
		<div class="flex items-center gap-2">
			{#if reminderSelectableCount > 0}
				<Button
					variant="outline"
					onclick={openReminderAll}
					data-testid="members-remind-toggle"
				>
					<svg
						class="mr-2 h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
					</svg>
					Erinnern ({reminderSelectableCount})
				</Button>
			{/if}
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
					class={[TOOLBAR_CONTROL, "w-full pl-8"]}
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

	<!-- Bulk-select control bar. The Liste's mobile cards carry no checkboxes, so
	     list-mode bulk stays desktop-only (md:flex); the Matrix card-stack has
	     selectable cells, so matrix-mode bulk shows at all widths. Both modes feed
	     the SAME selectedIds + BulkMarkBar (brief §3b.5 „EIN Modell in beiden Modi"). -->
	{#if data.members.length > 0}
		<div
			class="mb-3 {data.view === 'list'
				? 'hidden md:flex'
				: 'flex'} items-center justify-between gap-3"
		>
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
				<!-- S4 #4: the docked BulkMarkBar (Kit DateField + „Heute" + emerald
				     commit + gate-line) replaces the inline raw <input type=date> bar.
				     The „Alle offenen"-Select-all stays as the bulk-select helper. -->
				<div class="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
					<Checkbox
						size="sm"
						checked={allSelectableSelected}
						onchange={toggleSelectAll}
						disabled={selectableMembers.length === 0}
						labelClass="text-sm font-medium text-foreground"
					>
						Alle offenen{bulkYear !== null ? ` (${bulkYear})` : ''}
					</Checkbox>
					<div class="min-w-0 flex-1">
						<BulkMarkBar
							count={selectedIds.size}
							bind:gezahltAm={bulkDate}
							submitting={bulkSubmitting}
							onCommit={() => submitBulkPaid()}
							onCancel={exitSelectMode}
							data-testid="members-bulk"
						/>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Main view -->
	{#if data.view === 'matrix'}
		<MemberMatrix
			matrix={data.matrix}
			filter={data.filter}
			onRemind={openReminderFor}
			selectable={selectMode}
			{selectedIds}
			{bulkYear}
			onToggleSelect={toggleSelect}
		/>
	{:else}
		<MemberList
			members={filteredMembers}
			years={data.years}
			cells={cellMap}
			query={searchQuery}
			selectable={selectMode}
			{selectedIds}
			{bulkYear}
			onToggleSelect={toggleSelect}
			onEdit={openEdit}
			onRemind={openReminderFor}
			onAdd={() => (addOpen = true)}
			onClearSearch={() => (searchQuery = '')}
		/>
	{/if}
</div>

<MemberDialog bind:open={addOpen} mode="add" />
<MemberDialog bind:open={editOpen} mode="edit" member={editMember} />
<SendReminderBulkSheet
	bind:open={reminderOpen}
	candidates={reminderSubset ?? data.reminderCandidates}
	year={data.reminderYear}
	vereinName={page.data.vereinName}
	iban={data.reminderIban}
	onSuccess={() => invalidateAll()}
/>

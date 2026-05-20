<script lang="ts">
	import type { TransactionRow, ZahlungsartOption, ApprovedExpense } from '$lib/server/domain/transactions.js';
	import type { TransactionKind } from '$lib/server/domain/transactions.js';
	import TypeTabsHeader from './TypeTabsHeader.svelte';
	import SavedViewsBar from './SavedViewsBar.svelte';
	import TransactionRowComponent from './TransactionRow.svelte';
	import TransactionCardMobile from './TransactionCardMobile.svelte';
	import BulkActionsBar from './BulkActionsBar.svelte';
	import { EmptyState } from '$lib/components/ui/empty-state/index.js';
	import SepaCopyModal from './SepaCopyModal.svelte';
	import PostSepaMarkErstattetModal from './PostSepaMarkErstattetModal.svelte';
	import { toast } from 'svelte-sonner';
	import { invalidateAll } from '$app/navigation';
	import { goto } from '$app/navigation';

	interface Props {
		rows: TransactionRow[];
		total: number;
		zahlungsarten: ZahlungsartOption[];
		approvedPending: ApprovedExpense[];
		filters: {
			kind?: TransactionKind;
			search?: string;
			year?: number;
			month?: number;
		};
	}

	let { rows, total, zahlungsarten, approvedPending, filters }: Props = $props();

	// ── Local search ───────────────────────────────────────────────────────────
	let localSearch = $state('');
	let activeKind = $state<TransactionKind | undefined>(undefined);

	// Sync from server-provided filters on navigation
	$effect(() => {
		localSearch = filters.search ?? '';
		activeKind = filters.kind;
	});

	const filteredRows = $derived(() => {
		const s = localSearch.trim().toLowerCase();
		return rows.filter((r) => {
			const kindMatch = !activeKind || r.kind === activeKind;
			const searchMatch =
				!s ||
				r.bezeichnung.toLowerCase().includes(s) ||
				(r.bezahltVonDisplay?.toLowerCase().includes(s) ?? false) ||
				r.businessId.toLowerCase().includes(s);
			return kindMatch && searchMatch;
		});
	});

	const counts = $derived(() => {
		const s = localSearch.trim().toLowerCase();
		return {
			expense: rows.filter(
				(r) =>
					r.kind === 'expense' &&
					(!s ||
						r.bezeichnung.toLowerCase().includes(s) ||
						(r.bezahltVonDisplay?.toLowerCase().includes(s) ?? false)),
			).length,
			income: rows.filter(
				(r) => r.kind === 'income' && (!s || r.bezeichnung.toLowerCase().includes(s)),
			).length,
			donation: rows.filter(
				(r) =>
					r.kind === 'donation' &&
					(!s ||
						r.bezeichnung.toLowerCase().includes(s) ||
						(r.bezahltVonDisplay?.toLowerCase().includes(s) ?? false)),
			).length,
		};
	});

	// ── Selection / bulk ───────────────────────────────────────────────────────
	let selectedIds = $state<string[]>([]);

	function toggleRow(id: string) {
		if (selectedIds.includes(id)) {
			selectedIds = selectedIds.filter((x) => x !== id);
		} else {
			selectedIds = [...selectedIds, id];
		}
	}

	// ── SEPA modals ────────────────────────────────────────────────────────────
	let sepaModalOpen = $state(false);
	let postSepaModalOpen = $state(false);
	let sepaExpenseIds = $state<string[]>([]);
	let sepaTotalCents = $state(0);

	// Expenses for SEPA: either the bulk-selected ones filtered to expense kind,
	// or all approved-pending if user clicked from the dashboard CTA.
	const sepaExpenses = $derived(() => {
		if (sepaExpenseIds.length > 0) {
			return approvedPending.filter((e) => sepaExpenseIds.includes(e.id));
		}
		return approvedPending;
	});

	function openSepaModal(ids: string[]) {
		// Filter to only expense IDs that are in approvedPending
		const approvedIds = new Set(approvedPending.map((e) => e.id));
		sepaExpenseIds = ids.filter((id) => approvedIds.has(id));
		sepaModalOpen = true;
	}

	function onSepaXmlCopied(ids: string[], totalCents: number) {
		sepaModalOpen = false;
		sepaExpenseIds = ids;
		sepaTotalCents = totalCents;
		postSepaModalOpen = true;
	}

	function onPostSepaSuccess(count: number) {
		postSepaModalOpen = false;
		selectedIds = [];
		invalidateAll();
		toast.success(`${count} ${count === 1 ? 'Auslage' : 'Auslagen'} als erstattet markiert`);
	}

	// ── Bulk mark erstattet ────────────────────────────────────────────────────
	async function handleBulkMarkErstattet(ids: string[], chosenDate: string, zahlungsartId: string) {
		const formData = new FormData();
		formData.set('expenseIds', ids.join(','));
		formData.set('chosenDate', chosenDate);
		formData.set('zahlungsartId', zahlungsartId);

		const res = await fetch('?/bulk-mark-erstattet', { method: 'POST', body: formData });
		if (res.ok) {
			selectedIds = [];
			await invalidateAll();

			// Toast with 5s undo
			let undone = false;
			const toastId = toast.success(`${ids.length} als erstattet markiert`, {
				action: {
					label: 'Rückgängig (5s)',
					onClick: async () => {
						undone = true;
						for (const id of ids) {
							const fd = new FormData();
							fd.set('expenseId', id);
							await fetch('?/unmark-erstattet', { method: 'POST', body: fd });
						}
						await invalidateAll();
						toast.dismiss(toastId);
						toast.info('Rückgängig gemacht');
					},
				},
				duration: 5000,
			});

			setTimeout(async () => {
				if (!undone) toast.dismiss(toastId);
			}, 5000);
		} else {
			toast.error('Fehler beim Markieren');
		}
	}

	// ── Saved views ────────────────────────────────────────────────────────────
	function onSavedViewSelect(params: Record<string, string>) {
		const url = new URL(window.location.href);
		for (const [k, v] of Object.entries(params)) {
			if (v) url.searchParams.set(k, v);
			else url.searchParams.delete(k);
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(url.toString());
	}
</script>

<div class="space-y-4">
	<!-- ── Search + Type tabs ─────────────────────────────────────────────── -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
		<div class="relative flex-1">
			<svg
				class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
			<input
				type="search"
				bind:value={localSearch}
				placeholder="Bezeichnung, Empfänger, ID suchen…"
				class="w-full rounded-md border border-border bg-background py-2 pr-4 pl-9 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				aria-label="Transaktionen durchsuchen"
			/>
		</div>

		<TypeTabsHeader activeKind={activeKind} counts={counts()} onchange={(k) => (activeKind = k)} />
	</div>

	<!-- ── Saved views ─────────────────────────────────────────────────────── -->
	<SavedViewsBar onselect={onSavedViewSelect} />

	<!-- ── Bulk actions bar ────────────────────────────────────────────────── -->
	<BulkActionsBar
		{selectedIds}
		{zahlungsarten}
		onMarkErstattet={handleBulkMarkErstattet}
		onSepaXml={openSepaModal}
		onClear={() => (selectedIds = [])}
	/>

	<!-- ── Table ───────────────────────────────────────────────────────────── -->
	{#if filteredRows().length === 0}
		<EmptyState
			title="Keine Transaktionen gefunden"
			description={localSearch
				? 'Suche verfeinern oder Filter zurücksetzen.'
				: 'Noch keine Einträge vorhanden.'}
		>
			{#snippet icon()}
				<svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
				</svg>
			{/snippet}
		</EmptyState>
	{:else}
		<!--
			Mobile (< md): card variant — table columns squish unreadably at 390px
			(PM-009). Each card surfaces only the fields a Kassenwart scans on a
			phone (Bezeichnung, Betrag, kind/status, Datum).
		-->
		<div
			data-testid="transactions-card-list"
			class="space-y-2 md:hidden"
			role="list"
			aria-label="Transaktionen"
		>
			{#each filteredRows() as row (row.id)}
				<div role="listitem">
					<TransactionCardMobile
						{row}
						selected={selectedIds.includes(row.id)}
						ontoggle={toggleRow}
					/>
				</div>
			{/each}
		</div>

		<!-- Desktop (md+): full table -->
		<div
			data-testid="transactions-table"
			class="hidden overflow-x-auto rounded-lg border border-border md:block"
		>
			<table class="w-full text-sm" aria-label="Transaktionen">
				<thead>
					<tr class="border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
						<th class="w-10 px-3 py-2">
							<span class="sr-only">Auswählen</span>
						</th>
						<th class="px-3 py-2">Typ</th>
						<th class="px-3 py-2">Bezeichnung</th>
						<th class="px-3 py-2 text-right">Betrag</th>
						<th class="px-3 py-2">Datum</th>
						<th class="px-3 py-2">Status</th>
						<th class="hidden px-3 py-2 xl:table-cell">Kategorie</th>
						<th class="px-3 py-2"><span class="sr-only">Festgeschrieben</span></th>
						<th class="px-3 py-2"><span class="sr-only">Aktion</span></th>
					</tr>
				</thead>
				<tbody>
					{#each filteredRows() as row (row.id)}
						<TransactionRowComponent
							{row}
							selected={selectedIds.includes(row.id)}
							ontoggle={toggleRow}
						/>
					{/each}
				</tbody>
			</table>
		</div>

		<p class="text-xs text-muted-foreground text-right">
			{filteredRows().length} von {total} Einträgen
		</p>
	{/if}
</div>

<!-- ── Modals ──────────────────────────────────────────────────────────────── -->
<SepaCopyModal
	open={sepaModalOpen}
	expenses={sepaExpenses()}
	onclose={() => (sepaModalOpen = false)}
	oncopied={onSepaXmlCopied}
/>

<PostSepaMarkErstattetModal
	open={postSepaModalOpen}
	expenseIds={sepaExpenseIds}
	totalCents={sepaTotalCents}
	{zahlungsarten}
	onclose={() => (postSepaModalOpen = false)}
	onsuccess={onPostSepaSuccess}
/>

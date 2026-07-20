<!--
  /app/inbox — "Prüfung" triage list (Aurora redesign, spec §2.1).

  Pure triage: PageShell + PageHeader + FilterChips + a white card wrapping a
  TransactionRow stack. ZERO decision controls — the only path to a decision
  is the review route /app/inbox/[ausId] (view-before-decide by topology,
  spec §3). Keyboard ↑/↓/Home/End + Enter-to-open live in InboxList.

  "Manuell hinzufügen" (ManualImportSheet) stays wired in the toolbar slot.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { invalidateAll } from '$app/navigation';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import FilterChips from '$lib/components/ui/FilterChips.svelte';
	import InboxList from '$lib/components/admin/inbox/InboxList.svelte';
	import ManualImportSheet from '$lib/components/admin/inbox/ManualImportSheet.svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let importSheetOpen = $state(false);

	async function onImportSuccess(_ausId: string): Promise<void> {
		await invalidateAll();
	}

	type StatusLabel = 'Offen' | 'Geprüft' | 'Abgelehnt';
	const activeStatus = $derived<StatusLabel>(data.activeStatus ?? 'Offen');

	// FilterChips has no count slot (master §2.5) — counts are baked into labels.
	const chipOptions = $derived([
		{ value: 'Offen', label: `Offen (${data.counts.offen})` },
		{ value: 'Geprüft', label: `Geprüft (${data.counts.geprueft})` },
		{ value: 'Abgelehnt', label: `Abgelehnt (${data.counts.abgelehnt})` }
	]);

	// Header meta: count + open-€ sum on Offen; plain count elsewhere (spec §2.1, §3 resolved-Q5).
	const metaText = $derived.by(() => {
		const n = data.submissions.length;
		const word = n === 1 ? 'Einreichung' : 'Einreichungen';
		if (activeStatus === 'Offen') {
			return `${n} offen · ${formatMoney(data.offenSummeCents, 'auto')} warten auf Freigabe`;
		}
		if (activeStatus === 'Geprüft') return `${n} genehmigte ${word}`;
		return `${n} abgelehnte ${word}`;
	});

	function emptyHeadline(label: StatusLabel): string {
		if (label === 'Offen') return 'Alles geprüft';
		if (label === 'Geprüft') return 'Noch nichts genehmigt';
		return 'Keine Ablehnungen';
	}
	function emptyHint(label: StatusLabel): string {
		if (label === 'Offen')
			return 'Keine offenen Einreichungen — neue Auslagen erscheinen hier sofort.';
		if (label === 'Geprüft') return 'Sobald Auslagen genehmigt sind, erscheinen sie hier.';
		return 'Hier stehen abgelehnte Auslagen, falls sich später noch jemand wundert.';
	}
</script>

<svelte:head>
	<title>Prüfung – {page.data.vereinName}</title>
</svelte:head>

<PageShell width="list">
	<PageHeader title="Prüfung">
		{#snippet meta()}{metaText}{/snippet}
		{#snippet toolbar()}
			<FilterChips options={chipOptions} active={activeStatus} paramName="status" />
			<div class="ml-auto">
				<button
					type="button"
					onclick={() => (importSheetOpen = true)}
					class="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hairline bg-background px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-10"
				>
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						aria-hidden="true"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
					Manuell hinzufügen
				</button>
			</div>
		{/snippet}
	</PageHeader>

	{#if data.submissions.length === 0}
		<div
			class="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-hairline bg-secondary/40 px-6 py-20 text-center"
		>
			<div
				class="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-brand-soft text-primary-text"
				aria-hidden="true"
			>
				<svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			</div>
			<div>
				<p class="text-base font-semibold text-ink-900">{emptyHeadline(activeStatus)}</p>
				<p class="mt-1 text-sm text-ink-500">{emptyHint(activeStatus)}</p>
			</div>
		</div>
	{:else}
		<div class="rounded-2xl border border-hairline bg-card p-2 shadow-(--shadow-card) sm:p-3">
			<InboxList submissions={data.submissions} {activeStatus} />
		</div>
	{/if}
</PageShell>

<ManualImportSheet
	bind:open={importSheetOpen}
	vereinName={data.vereinName}
	members={data.members}
	onSuccess={onImportSuccess}
/>

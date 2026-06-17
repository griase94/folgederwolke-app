<!--
  /app/inbox — Audit Inbox list view.

  Scrollable list of auslagen_submissions, newest first. Each row is a card
  (rosa theme, accent for unreviewed). C7-INBOX full adds:

    - Filter chips (Offen / Geprüft / Abgelehnt) with count badges, via
      `?status=` on the URL.
    - Inline approve/reject actions on each card row (kebab menu pattern
      from C3-DISC), with a reasoned modal for reject.

  Arrow keys ↑/↓ move focus between cards, Enter follows the link to the
  full-screen review card at /app/inbox/[ausId].

  The header also exposes the "Manuell hinzufügen" sheet that the
  manual-import-builder already wired up (ManualImportSheet).
-->
<script lang="ts">
	import { page } from '$app/state';
	import ManualImportSheet from '$lib/components/admin/inbox/ManualImportSheet.svelte';
	import InboxList from '$lib/components/admin/inbox/InboxList.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types.js';
	import PageShell from '$lib/components/layout/PageShell.svelte';

	let { data }: { data: PageData } = $props();

	let importSheetOpen = $state(false);

	async function onImportSuccess(_ausId: string): Promise<void> {
		await invalidateAll();
	}

	// C7-INBOX full: filter tabs across Offen / Geprüft / Abgelehnt.
	type StatusLabel = 'Offen' | 'Geprüft' | 'Abgelehnt';
	const FILTER_LABELS: readonly StatusLabel[] = ['Offen', 'Geprüft', 'Abgelehnt'] as const;
	const activeStatus = $derived<StatusLabel>(data.activeStatus ?? 'Offen');
	const visibleCount = $derived(data.submissions.length);

	function countFor(label: StatusLabel): number {
		if (label === 'Offen') return data.counts.offen;
		if (label === 'Geprüft') return data.counts.geprueft;
		return data.counts.abgelehnt;
	}

	function headerSummary(label: StatusLabel, n: number): string {
		const word = n === 1 ? 'Einreichung' : 'Einreichungen';
		if (label === 'Offen') return `${n} offene ${word}`;
		if (label === 'Geprüft') return `${n} genehmigte ${word}`;
		return `${n} abgelehnte ${word}`;
	}

	function emptyHeadlineFor(label: StatusLabel): string {
		if (label === 'Offen') return 'Alles geprüft';
		if (label === 'Geprüft') return 'Noch nichts genehmigt';
		return 'Keine Ablehnungen';
	}

	function emptyHintFor(label: StatusLabel): string {
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
	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground">Prüfung</h1>
			<p class="mt-0.5 text-sm text-muted-foreground">
				{headerSummary(activeStatus, visibleCount)}
			</p>
		</div>
		<Button onclick={() => (importSheetOpen = true)} variant="outline" size="sm">
			<svg
				class="mr-1.5 h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			Manuell hinzufügen
		</Button>
	</div>

	<!-- ── Filter chips (C7-INBOX full) ──────────────────────────────────── -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<nav class="mb-4 flex flex-wrap gap-2" aria-label="Filter">
		{#each FILTER_LABELS as label (label)}
			{@const isActive = activeStatus === label}
			{@const count = countFor(label)}
			<a
				href={`/app/inbox?status=${encodeURIComponent(label)}`}
				class={[
					'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					isActive
						? 'bg-primary-strong text-primary-foreground'
						: 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
				].join(' ')}
				data-testid={`inbox-filter-${label}`}
				aria-current={isActive ? 'page' : undefined}
			>
				<span>{label}</span>
				<span
					class={[
						'tabular-nums',
						isActive ? 'opacity-90' : 'opacity-70'
					].join(' ')}
				>
					({count})
				</span>
			</a>
		{/each}
	</nav>

	<!-- ── List or empty state ─────────────────────────────────────────────── -->
	{#if visibleCount === 0}
		<div
			class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-20 text-center"
		>
			<div
				class="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
				aria-hidden="true"
			>
				<svg
					class="h-8 w-8"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.75"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			</div>
			<div>
				<p class="text-base font-semibold text-foreground">{emptyHeadlineFor(activeStatus)}</p>
				<p class="mt-1 text-sm text-muted-foreground">{emptyHintFor(activeStatus)}</p>
			</div>
		</div>
	{:else}
		<InboxList submissions={data.submissions} kategorieOptions={data.kategorieOptions} />
	{/if}
</PageShell>

<!-- ── ManualImportSheet ────────────────────────────────────────────────── -->
<ManualImportSheet
	bind:open={importSheetOpen}
	vereinName={data.vereinName}
	members={data.members}
	onSuccess={onImportSuccess}
/>

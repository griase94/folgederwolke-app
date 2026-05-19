<!--
  /app/inbox — Audit Inbox list view.

  Scrollable list of pending auslagen_submissions (decided_at IS NULL),
  newest first. Each row is a card (rosa theme, accent for unreviewed).
  Empty state: "Alles geprüft" with a friendly icon.

  Arrow keys ↑/↓ move focus between cards, Enter follows the link to the
  full-screen review card at /app/inbox/[ausId].

  The header also exposes the "Manuell hinzufügen" sheet that the
  manual-import-builder already wired up (ManualImportSheet).
-->
<script lang="ts">
	import ManualImportSheet from '$lib/components/admin/inbox/ManualImportSheet.svelte';
	import InboxList from '$lib/components/admin/inbox/InboxList.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let importSheetOpen = $state(false);

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async function onImportSuccess(_ausId: string): Promise<void> {
		await invalidateAll();
	}

	const openCount = $derived(data.submissions.length);
</script>

<svelte:head>
	<title>Audit Inbox – Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground">Audit Inbox</h1>
			<p class="mt-0.5 text-sm text-muted-foreground">
				{openCount}
				{openCount === 1 ? 'offene Einreichung' : 'offene Einreichungen'}
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

	<!-- ── List or empty state ─────────────────────────────────────────────── -->
	{#if openCount === 0}
		<div
			class="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-20 text-center"
		>
			<div
				class="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
				aria-hidden="true"
			>
				<svg class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			</div>
			<div>
				<p class="text-base font-semibold text-foreground">Alles geprüft</p>
				<p class="mt-1 text-sm text-muted-foreground">
					Keine offenen Einreichungen — neue Auslagen erscheinen hier sofort.
				</p>
			</div>
		</div>
	{:else}
		<InboxList submissions={data.submissions} />
	{/if}
</div>

<!-- ── ManualImportSheet ────────────────────────────────────────────────── -->
<ManualImportSheet
	bind:open={importSheetOpen}
	members={data.members}
	onSuccess={onImportSuccess}
/>

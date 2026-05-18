<!--
  /app/inbox/[ausId] — full-screen review card for one submission.

  Renders the AuditCard component (Beleg preview + metadata + actions). If
  the submission is already decided (admin landed via a stale link), shows
  a "schon entschieden" banner instead of the action buttons.

  Cmd-K (and the explicit "Zurück" link) returns to the list.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import AuditCard from '$lib/components/admin/inbox/AuditCard.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	function backToList(): void {
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto('/app/inbox');
	}

	function onKeydown(e: KeyboardEvent): void {
		// Cmd-K / Ctrl-K returns to the list.
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			backToList();
		} else if (e.key === 'Escape') {
			// Esc also returns to the list when no dialog is open. Dialog
			// components stop propagation, so this is safe.
			const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
			if (tag !== 'input' && tag !== 'textarea') {
				backToList();
			}
		}
	}

	function formatCents(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', {
			style: 'currency',
			currency: 'EUR'
		});
	}

	const isDecided = $derived(data.decision.decidedAt !== null);
</script>

<svelte:head>
	<title>{data.submission.ausId} – Audit Inbox</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
	<!-- ── Breadcrumb / back link ──────────────────────────────────────────── -->
	<div class="mb-4 flex items-center justify-between gap-3">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/inbox" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Zurück zur Inbox
		</a>
		<span class="hidden text-xs text-muted-foreground sm:inline">
			<kbd class="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Cmd</kbd>
			+
			<kbd class="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">K</kbd>
			schließt die Karte
		</span>
	</div>

	{#if isDecided}
		<!-- Already-decided banner -->
		<div
			class="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
			role="status"
		>
			<div class="flex items-center gap-2 text-sm">
				{#if data.decision.decision === 'approved'}
					<Badge variant="secondary" class="bg-emerald-100 text-emerald-900">Freigegeben</Badge>
					<span class="text-muted-foreground">
						{formatCents(data.submission.betragCents)} ·
						{new Date(data.decision.decidedAt!).toLocaleDateString('de-DE')}
					</span>
				{:else if data.decision.decision === 'rejected'}
					<Badge variant="destructive">Abgelehnt</Badge>
					<span class="text-muted-foreground">
						{new Date(data.decision.decidedAt!).toLocaleDateString('de-DE')}
					</span>
				{/if}
			</div>
			{#if data.decision.decision === 'approved' && data.linkedExpense}
				<Button
					variant="outline"
					size="sm"
					onclick={() => {
						// eslint-disable-next-line svelte/no-navigation-without-resolve
						goto(`/app/transactions/${data.linkedExpense!.id}`);
					}}
				>
					Zur Transaktion →
				</Button>
			{/if}
		</div>
	{/if}

	<!-- ── Full-screen review card ─────────────────────────────────────────── -->
	<AuditCard submission={data.submission} decided={isDecided} />

	{#if isDecided && data.decision.decisionReason}
		<div class="mt-6 rounded-xl border border-border bg-card px-4 py-3 text-sm">
			<p class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
				Grund
			</p>
			<p class="whitespace-pre-line text-foreground">{data.decision.decisionReason}</p>
		</div>
	{/if}
</div>

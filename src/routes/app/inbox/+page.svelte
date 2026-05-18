<script lang="ts">
	import ManualImportSheet from '$lib/components/admin/inbox/ManualImportSheet.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let importSheetOpen = $state(false);

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async function onImportSuccess(_ausId: string): Promise<void> {
		await invalidateAll();
	}

	function formatCents(cents: bigint | number): string {
		return (Number(cents) / 100).toLocaleString('de-DE', {
			style: 'currency',
			currency: 'EUR'
		});
	}

	function formatDate(d: Date | string | null | undefined): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Audit Inbox – Folge der Wolke</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
	<!-- ── Header ─────────────────────────────────────────────────────────── -->
	<div class="flex items-center justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Audit Inbox</h1>
			<p class="text-muted-foreground mt-1 text-sm">
				Offene Auslagen-Einreichungen prüfen und freigeben.
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

	<!-- ── Submissions table ───────────────────────────────────────────────── -->
	{#if data.submissions.length === 0}
		<div
			class="text-muted-foreground flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center"
		>
			<svg
				class="h-10 w-10 opacity-30"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="1.5"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>
			<p class="text-sm font-medium">Keine offenen Einreichungen</p>
			<p class="text-xs">
				Neue Einreichungen erscheinen hier sobald sie über das öffentliche Formular eingehen.
			</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-xl border">
			<table class="w-full text-sm">
				<thead class="bg-muted/50">
					<tr>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Bezeichnung</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Bezahlt von</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Betrag</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Eingereicht</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Beleg</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.submissions as s (s.id)}
						<tr class="hover:bg-muted/30 transition-colors">
							<td class="px-4 py-3 font-mono text-xs text-muted-foreground">{s.businessId}</td>
							<td class="px-4 py-3 font-medium">{s.bezeichnung}</td>
							<td class="px-4 py-3 text-muted-foreground">{s.bezahltVonDisplay}</td>
							<td class="px-4 py-3 text-right tabular-nums font-medium"
								>{formatCents(s.betragCents)}</td
							>
							<td class="px-4 py-3 text-muted-foreground">{formatDate(s.submittedAt)}</td>
							<td class="px-4 py-3">
								{#if s.belegDriveFileId}
									<Badge variant="secondary">Beleg</Badge>
								{:else}
									<span class="text-muted-foreground text-xs">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<!-- ── ManualImportSheet ────────────────────────────────────────────────── -->
<ManualImportSheet
	bind:open={importSheetOpen}
	members={data.members}
	onSuccess={onImportSuccess}
/>

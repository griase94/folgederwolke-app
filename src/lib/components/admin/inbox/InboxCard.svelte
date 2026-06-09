<!--
  InboxCard — list-item card for one auslagen_submission row.

  C7-INBOX full extensions:
    - Status data attributes (data-decided, data-decision) for filter
      assertions and visual status pills.
    - Inline approve/reject actions (C3-DISC kebab pattern) on open rows
      that delegate to the page-level ?/inline-approve and ?/inline-reject
      form actions. Inline-reject opens the existing RejectDialog with a
      template picker and free-text Grund.

  The card itself remains a clickable link to /app/inbox/[ausId]. The inline
  action controls live in a footer beneath the card body so clicking them
  doesn't trigger the wrapping link.

  Keyboard navigation (focus + Enter) is handled by the wrapping <a>; arrow-key
  navigation between cards lives in InboxList.svelte.
-->
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import RejectDialog from '$lib/components/admin/inbox/RejectDialog.svelte';
	import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import type { KategorieOption } from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import type { InboxSubmissionView } from '$lib/domain/inbox.js';

	let {
		submission,
		index,
		kategorieOptions
	}: { submission: InboxSubmissionView; index: number; kategorieOptions: KategorieOption[] } =
		$props();

	function formatCents(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', {
			style: 'currency',
			currency: 'EUR'
		});
	}

	function formatDate(d: string | null | undefined): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	}

	function relativeTime(iso: string): string {
		const then = new Date(iso).getTime();
		const now = Date.now();
		const deltaSec = Math.max(0, Math.round((now - then) / 1000));

		if (deltaSec < 60) return 'gerade eben';
		const min = Math.round(deltaSec / 60);
		if (min < 60) return `vor ${min} Min`;
		const h = Math.round(min / 60);
		if (h < 24) return `vor ${h} h`;
		const d = Math.round(h / 24);
		if (d < 30) return `vor ${d} ${d === 1 ? 'Tag' : 'Tagen'}`;
		return formatDate(iso);
	}

	const isUnread = $derived(submission.reviewedAt === null && submission.decided === 'no');
	const isOpen = $derived(submission.decided === 'no');
	const isApproved = $derived(submission.decision === 'approved');
	const isRejected = $derived(submission.decision === 'rejected');

	let dropdownOpen = $state(false);
	let rejectDialogOpen = $state(false);
	let approveSubmitting = $state(false);
	let approveRevealed = $state(false);
	let kategorieName = $state('');

	function openRejectDialog(): void {
		dropdownOpen = false;
		rejectDialogOpen = true;
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<div
	data-testid="inbox-card-wrapper"
	data-aus-id={submission.ausId}
	data-decided={submission.decided}
	data-decision={submission.decision ?? 'none'}
	class="relative"
>
	<a
		href="/app/inbox/{submission.ausId}"
		data-inbox-card-index={index}
		data-testid="inbox-card"
		data-aus-id={submission.ausId}
		data-decided={submission.decided}
		data-decision={submission.decision ?? 'none'}
		aria-label="Einreichung {submission.ausId} öffnen"
		class={[
			'group focus-visible:ring-ring relative flex items-stretch gap-4 rounded-xl border bg-card px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 sm:px-5 sm:py-4',
			isUnread ? 'border-primary bg-primary-50' : 'border-border',
			isRejected ? 'opacity-75' : ''
		].join(' ')}
	>
		{#if isUnread}
			<span
				class="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-primary"
				aria-hidden="true"
			></span>
		{/if}

		<!-- Beleg thumbnail / icon -->
		<div
			class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
			aria-hidden="true"
		>
			{#if submission.belegDriveFileId || submission.belegFileId}
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M9 17V7a2 2 0 012-2h6.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V17a2 2 0 01-2 2h-7a2 2 0 01-2-2zM7 7v12a2 2 0 002 2h8M3 5v12a2 2 0 002 2h2"
					/>
				</svg>
			{:else}
				<svg class="h-6 w-6 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			{/if}
		</div>

		<!-- Body -->
		<div class="flex min-w-0 flex-1 flex-col">
			<div class="flex items-baseline justify-between gap-3">
				<span class="font-mono text-xs tracking-tight text-muted-foreground">
					{submission.ausId}
				</span>
				<span class="text-xs text-muted-foreground">{relativeTime(submission.submittedAt)}</span>
			</div>
			<div class="mt-0.5 truncate font-medium text-foreground group-hover:text-primary">
				{submission.bezeichnung}
			</div>
			<div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
				<span class="truncate">{submission.bezahltVonDisplay}</span>
				{#if submission.rechnungsdatum}
					<span class="inline-flex items-center gap-1">
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
							<rect x="3" y="4" width="18" height="18" rx="2" />
							<path stroke-linecap="round" stroke-linejoin="round" d="M16 2v4M8 2v4M3 10h18" />
						</svg>
						{formatDate(submission.rechnungsdatum)}
					</span>
				{/if}
				{#if isUnread}
					<Badge variant="secondary" class="bg-primary/10 text-primary">Neu</Badge>
				{:else if isApproved}
					<Badge variant="secondary" class="bg-emerald-50 text-emerald-700">Genehmigt</Badge>
				{:else if isRejected}
					<Badge variant="secondary" class="bg-red-50 text-red-700">Abgelehnt</Badge>
				{/if}
			</div>
		</div>

		<!-- Amount -->
		<div class="flex shrink-0 flex-col items-end justify-center">
			<span class="text-base font-semibold tabular-nums text-foreground">
				{formatCents(submission.betragCents)}
			</span>
		</div>
	</a>

	<!-- ── Inline action controls (C7-INBOX full, progressive reveal) ───── -->
	{#if isOpen}
		<div
			class="mt-2 flex flex-col items-stretch gap-2 sm:items-end"
			data-testid="inbox-card-actions"
			data-aus-id={submission.ausId}
		>
			{#if !approveRevealed}
				<div class="flex items-center justify-end gap-2">
					<button
						type="button"
						data-testid="inbox-card-approve-start"
						onclick={() => (approveRevealed = true)}
						class="min-h-11 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
						aria-label="Auslage {submission.ausId} genehmigen"
					>Genehmigen</button>

					<DropdownMenu.Root bind:open={dropdownOpen}>
						<DropdownMenu.Trigger
							class="rounded-md border border-border bg-background p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							aria-label="Weitere Aktionen für {submission.ausId}"
							data-testid="inbox-card-kebab"
						>
							<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
								<circle cx="12" cy="5" r="1.5" />
								<circle cx="12" cy="12" r="1.5" />
								<circle cx="12" cy="19" r="1.5" />
							</svg>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="end" class="w-48">
							<DropdownMenu.Item
								onSelect={openRejectDialog}
								data-testid="inbox-card-reject"
								class="text-destructive focus:text-destructive"
							>
								Ablehnen…
							</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			{:else}
				<!-- Vertical reveal panel: picker on its own line, buttons beneath. -->
				<form
					method="POST"
					action="/app/inbox?/inline-approve"
					class="flex w-full flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:w-80"
					use:enhance={() => {
						approveSubmitting = true;
						return async ({ result }) => {
							approveSubmitting = false;
							if (result.type === 'success') {
								toast.success(`Auslage ${submission.ausId} genehmigt`);
								await invalidateAll();
							} else if (result.type === 'failure') {
								const d = result.data as { error?: string } | null;
								toast.error(d?.error ?? 'Genehmigung fehlgeschlagen');
							}
						};
					}}
				>
					<input type="hidden" name="submissionId" value={submission.id} />
					<KategoriePicker
						id={`approve-kat-${submission.ausId}`}
						options={kategorieOptions}
						value={kategorieName}
						onChange={(n) => (kategorieName = n)}
						onSphere={() => {}}
						required
					/>
					<div class="flex items-center justify-end gap-2">
						<button
							type="button"
							onclick={() => { approveRevealed = false; kategorieName = ''; }}
							class="min-h-11 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
						>Abbrechen</button>
						<button
							type="submit"
							data-testid="inbox-card-approve"
							disabled={approveSubmitting || !kategorieName}
							class="min-h-11 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
						>
							{approveSubmitting ? 'Genehmige…' : '✓ Freigeben'}
						</button>
					</div>
				</form>
			{/if}
		</div>
	{/if}
</div>

<!-- ── RejectDialog (reasoned modal with template picker + free-text Grund) -->
{#if isOpen}
	<RejectDialog
		bind:open={rejectDialogOpen}
		submissionId={submission.id}
		ausId={submission.ausId}
		formAction="/app/inbox?/inline-reject"
	/>
{/if}

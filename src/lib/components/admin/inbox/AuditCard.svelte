<!--
  AuditCard — full-screen review card for one auslagen_submission.

  Two-column layout on desktop (Beleg preview left, metadata + actions right);
  stacked on mobile. Actions:

    1. Approve  → POST ?/approve   (creates `expenses` row, NO mail)
    2. Reject   → opens RejectDialog (template picker → mail + audit)
    3. → Verzicht spenden → opens AufwandsspendeStubModal (Phase 2 deferred)

  NO "Mark Erstattet" here — that lives on the transaction detail page
  (post-approval). NO 6-checkbox grid. NO auto-approve.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import BelegPreview from './BelegPreview.svelte';
	import RejectDialog from './RejectDialog.svelte';
	import AufwandsspendeStubModal from './AufwandsspendeStubModal.svelte';
	import type { InboxSubmissionDetailView } from '$lib/domain/inbox.js';

	let { submission }: { submission: InboxSubmissionDetailView } = $props();

	let rejectOpen = $state(false);
	let aufwandsspendeOpen = $state(false);
	let approving = $state(false);
	let approveError = $state<string | null>(null);

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

	function formatDateTime(d: string | null | undefined): string {
		if (!d) return '—';
		return new Date(d).toLocaleString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<article
	class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
	aria-label="Einreichung {submission.ausId}"
>
	<!-- ── Beleg preview (left column) ──────────────────────────────────────── -->
	<div class="flex min-h-[28rem] flex-col">
		<BelegPreview
			driveFileId={submission.belegDriveFileId}
			viewLink={submission.belegViewLink}
			originalName={submission.belegOriginalName}
		/>
	</div>

	<!-- ── Metadata + actions (right column) ────────────────────────────────── -->
	<div class="flex flex-col gap-5">
		<!-- Headline -->
		<header class="space-y-2">
			<div class="flex items-center gap-2 text-xs">
				<span class="font-mono text-muted-foreground">{submission.ausId}</span>
				{#if submission.reviewedAt === null}
					<Badge variant="secondary" class="bg-primary/10 text-primary">Neu</Badge>
				{:else}
					<Badge variant="secondary">Schon gesehen</Badge>
				{/if}
			</div>
			<h2 class="text-xl font-semibold leading-tight text-foreground">
				{submission.bezeichnung}
			</h2>
			<p class="text-3xl font-bold tabular-nums text-foreground">
				{formatCents(submission.betragCents)}
			</p>
		</header>

		<!-- Metadata grid -->
		<dl class="grid grid-cols-1 gap-y-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
			<dt class="text-muted-foreground">Bezahlt von</dt>
			<dd class="font-medium text-foreground">{submission.bezahltVonDisplay}</dd>

			{#if submission.bezahltVonKind === 'extern' && submission.externIbanMasked}
				<dt class="text-muted-foreground">IBAN</dt>
				<dd class="font-mono text-foreground" title="Vollständige IBAN nur auf Anfrage einsehbar.">
					{submission.externIbanMasked}
				</dd>
			{/if}

			{#if submission.bezahltVonKind === 'extern' && submission.externEmail}
				<dt class="text-muted-foreground">E-Mail</dt>
				<dd class="text-foreground">{submission.externEmail}</dd>
			{/if}

			{#if submission.memberContext}
				<dt class="text-muted-foreground">Mitglied</dt>
				<dd class="text-foreground">
					<a
						href="/app/mitglieder/{submission.memberContext.id}"
						class="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{submission.memberContext.vorname}
						{submission.memberContext.nachname}
					</a>
					{#if submission.memberContext.austrittsDatum}
						<span class="ml-1 text-xs text-destructive">(ausgetreten {formatDate(submission.memberContext.austrittsDatum)})</span>
					{/if}
					{#if submission.memberContext.email}
						<div class="text-xs text-muted-foreground">{submission.memberContext.email}</div>
					{/if}
				</dd>
			{/if}

			{#if submission.rechnungsdatum}
				<dt class="text-muted-foreground">Rechnungsdatum</dt>
				<dd class="text-foreground">{formatDate(submission.rechnungsdatum)}</dd>
			{/if}

			{#if submission.projectName}
				<dt class="text-muted-foreground">Projekt</dt>
				<dd class="text-foreground">{submission.projectName}</dd>
			{/if}

			<dt class="text-muted-foreground">Eingereicht</dt>
			<dd class="text-foreground">{formatDateTime(submission.submittedAt)}</dd>

			{#if submission.wofuer}
				<dt class="text-muted-foreground">Wofür</dt>
				<dd class="whitespace-pre-line text-foreground">{submission.wofuer}</dd>
			{/if}

			{#if submission.kommentar}
				<dt class="text-muted-foreground">Kommentar</dt>
				<dd class="whitespace-pre-line text-foreground">{submission.kommentar}</dd>
			{/if}

			<dt class="text-muted-foreground">Datenschutz</dt>
			<dd class="text-xs text-muted-foreground">
				Version {submission.consentTextVersion} · {formatDateTime(submission.consentGivenAt)}
			</dd>
		</dl>

		<!-- Actions -->
		<div class="mt-2 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap">
			<!-- Approve -->
			<form
				method="POST"
				action="?/approve"
				use:enhance={() => {
					approving = true;
					approveError = null;
					return async ({ result, update }) => {
						approving = false;
						if (result.type === 'failure') {
							const data = result.data as { error?: string } | null;
							approveError = data?.error ?? 'Freigabe fehlgeschlagen.';
						} else {
							await update();
						}
					};
				}}
				class="sm:flex-1"
			>
				<input type="hidden" name="submissionId" value={submission.id} />
				<Button type="submit" class="w-full" disabled={approving}>
					{#if approving}
						<svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
						</svg>
					{:else}
						<svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{/if}
					Freigeben
				</Button>
			</form>

			<!-- Reject -->
			<Button
				type="button"
				variant="destructive"
				class="sm:flex-1"
				onclick={() => (rejectOpen = true)}
				disabled={approving}
			>
				<svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
				Ablehnen
			</Button>

			<!-- Aufwandsspende stub (Phase 2 deferred) -->
			<Button
				type="button"
				variant="outline"
				class="sm:flex-1"
				onclick={() => (aufwandsspendeOpen = true)}
				disabled={approving}
			>
				→ Verzicht spenden
			</Button>
		</div>

		{#if approveError}
			<p class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
				{approveError}
			</p>
		{/if}

		<p class="text-xs text-muted-foreground">
			Erstattet markieren passiert nach der Freigabe auf der Transaktionsseite.
		</p>
	</div>
</article>

<RejectDialog bind:open={rejectOpen} submissionId={submission.id} ausId={submission.ausId} />
<AufwandsspendeStubModal bind:open={aufwandsspendeOpen} />

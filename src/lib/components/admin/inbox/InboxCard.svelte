<!--
  InboxCard — list-item card for one pending auslagen_submission.

  Each card is a single clickable link to /app/inbox/[ausId]. Renders AUS-ID,
  bezeichnung, amount, bezahlt_von, project, datum, submitted_at (relative)
  and a small Beleg thumbnail / icon. Unread (reviewed_at IS NULL) submissions
  get a left accent border.

  Keyboard navigation (focus + Enter) is handled by the wrapping <a>; arrow-key
  navigation between cards lives in InboxList.svelte.
-->
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { InboxSubmissionView } from '$lib/domain/inbox.js';

	let { submission, index }: { submission: InboxSubmissionView; index: number } = $props();

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

	const isUnread = $derived(submission.reviewedAt === null);
</script>

<a
	href="/app/inbox/{submission.ausId}"
	data-inbox-card-index={index}
	aria-label="Einreichung {submission.ausId} öffnen"
	class="group focus-visible:ring-ring relative flex items-stretch gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 sm:px-5 sm:py-4"
	class:border-primary={isUnread}
	class:bg-primary-50={isUnread}
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
		{#if submission.belegDriveFileId}
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

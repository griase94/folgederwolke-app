<!--
  ReviewFacts — the right-column facts of the review card (spec §2.2).
  Mono id eyebrow + Neu/Schon-gesehen chip · Bezeichnung (h2) · UNSIGNED solid
  ink amount (the claim amount, not a ledger line) · hairline-ruled dl with
  Bezahlt von (+ Mitglied/Extern chip; Extern masked IBAN + E-Mail; Mitglied
  link + amber ausgetreten note) · Rechnungsdatum · Eingereicht · Wofür ·
  Kommentar · Datenschutz vN footnote.
-->
<script lang="ts">
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import type { InboxSubmissionDetailView } from '$lib/domain/inbox.js';

	let { submission }: { submission: InboxSubmissionDetailView } = $props();

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

	const isExtern = $derived(submission.bezahltVonKind === 'extern');
	const isMember = $derived(submission.bezahltVonKind === 'member' && submission.memberContext !== null);
	const amount = $derived(formatMoney(submission.betragCents, 'never'));
</script>

<div class="flex flex-col gap-5">
	<header class="space-y-2">
		<div class="flex items-center gap-2 text-xs">
			<span class="font-mono text-ink-500">{submission.ausId}</span>
			{#if submission.reviewedAt === null}
				<span
					class="inline-flex items-center rounded-full bg-gradient-brand-soft px-2 py-0.5 text-[11px] font-medium text-primary-text"
					>Neu</span
				>
			{:else}
				<span
					class="inline-flex items-center rounded-full border border-hairline bg-card px-2 py-0.5 text-[11px] font-medium text-ink-500"
					>Schon gesehen</span
				>
			{/if}
		</div>
		<h2 class="text-xl font-semibold leading-tight text-ink-900">{submission.bezeichnung}</h2>
		<p data-testid="review-amount" class="text-[28px] font-bold leading-none tabular-nums text-ink-900">
			{amount}
		</p>
	</header>

	<dl class="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-4 gap-y-0 text-sm">
		<!-- Bezahlt von -->
		<dt class="border-t border-hairline py-2.5 text-ink-500">Bezahlt von</dt>
		<dd class="border-t border-hairline py-2.5 text-ink-900">
			<span class="inline-flex flex-wrap items-center gap-1.5">
				{#if isMember && submission.memberContext}
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={`/app/mitglieder/${submission.memberContext.id}`}
						class="font-medium text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{submission.memberContext.vorname}
						{submission.memberContext.nachname}
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
					<span
						class="inline-flex items-center rounded-full border border-hairline bg-card px-1.5 py-px text-[10px] font-medium text-ink-500"
						>Mitglied</span
					>
					{#if submission.memberContext.austrittsDatum}
						<span class="text-xs text-severity-warn-text"
							>(ausgetreten {formatDate(submission.memberContext.austrittsDatum)})</span
						>
					{/if}
				{:else}
					<span class="font-medium">{submission.bezahltVonDisplay}</span>
					{#if isExtern}
						<span
							class="inline-flex items-center rounded-full border border-hairline bg-card px-1.5 py-px text-[10px] font-medium text-ink-500"
							>Extern</span
						>
					{/if}
				{/if}
			</span>
			{#if isMember && submission.memberContext?.email}
				<div class="mt-0.5 text-xs text-ink-500">{submission.memberContext.email}</div>
			{/if}
		</dd>

		{#if isExtern && submission.externIbanMasked}
			<dt class="border-t border-hairline py-2.5 text-ink-500">IBAN</dt>
			<dd
				class="border-t border-hairline py-2.5 font-mono text-ink-900"
				title="Vollständige IBAN nur auf Anfrage einsehbar."
			>
				{submission.externIbanMasked}
			</dd>
		{/if}
		{#if isExtern && submission.externEmail}
			<dt class="border-t border-hairline py-2.5 text-ink-500">E-Mail</dt>
			<dd class="border-t border-hairline py-2.5 text-ink-900">{submission.externEmail}</dd>
		{/if}

		{#if submission.rechnungsdatum}
			<dt class="border-t border-hairline py-2.5 text-ink-500">Rechnungsdatum</dt>
			<dd class="border-t border-hairline py-2.5 text-ink-900">{formatDate(submission.rechnungsdatum)}</dd>
		{/if}

		<dt class="border-t border-hairline py-2.5 text-ink-500">Eingereicht</dt>
		<dd class="border-t border-hairline py-2.5 text-ink-900">{formatDateTime(submission.submittedAt)}</dd>

		{#if submission.wofuer}
			<dt class="border-t border-hairline py-2.5 text-ink-500">Wofür</dt>
			<dd class="border-t border-hairline py-2.5 whitespace-pre-line text-ink-900">{submission.wofuer}</dd>
		{/if}

		{#if submission.kommentar}
			<dt class="border-t border-hairline py-2.5 text-ink-500">Kommentar</dt>
			<dd class="border-t border-hairline py-2.5 whitespace-pre-line text-ink-900">{submission.kommentar}</dd>
		{/if}

		<dt class="border-t border-b border-hairline py-2.5 text-ink-500">Datenschutz</dt>
		<dd class="border-t border-b border-hairline py-2.5 text-xs text-ink-500">
			Version {submission.consentTextVersion} · {formatDateTime(submission.consentGivenAt)}
		</dd>
	</dl>
</div>

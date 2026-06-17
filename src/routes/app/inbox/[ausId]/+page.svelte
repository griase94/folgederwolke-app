<!--
  /app/inbox/[ausId] — Beleg-hero + decision-band review route (Aurora, spec §2.2/§2.3).

  PageShell width="full" single white card, internal split
  lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]:
    LEFT  = BelegHero (desktop inline hero / mobile compact-fold modal + kein-Beleg).
    RIGHT = ReviewFacts, then DecisionBand (open) or DecidedBanner (decided).
  PageHeader carries the mobile back slot → /app/inbox?status=Offen "Prüfung".
  Cmd-K / Esc returns to the list.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import PageHeader from '$lib/components/layout/PageHeader.svelte';
	import BelegHero from '$lib/components/admin/inbox/BelegHero.svelte';
	import ReviewFacts from '$lib/components/admin/inbox/ReviewFacts.svelte';
	import DecisionBand from '$lib/components/admin/inbox/DecisionBand.svelte';
	import DecidedBanner from '$lib/components/admin/inbox/DecidedBanner.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const isDecided = $derived(data.decision.decidedAt !== null);

	// Narrow the DB text column to the union type DecidedBanner expects.
	const decisionKind = $derived(
		data.decision.decision === 'approved'
			? ('approved' as const)
			: data.decision.decision === 'rejected'
				? ('rejected' as const)
				: null
	);

	function backToList(): void {
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto('/app/inbox?status=Offen');
	}

	function onKeydown(e: KeyboardEvent): void {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			backToList();
		} else if (e.key === 'Escape') {
			const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
			if (tag !== 'input' && tag !== 'textarea') backToList();
		}
	}
</script>

<svelte:head>
	<title>{data.submission.ausId} – Prüfung</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<PageShell width="full">
	<PageHeader title={data.submission.bezeichnung} backHref="/app/inbox?status=Offen" backLabel="Prüfung" />

	<div
		class="overflow-hidden rounded-2xl border border-hairline bg-white shadow-(--shadow-card)"
		aria-label="Einreichung {data.submission.ausId}"
	>
		<div class="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,1fr)]">
			<!-- LEFT: Beleg hero (desktop) / compact fold (mobile). -->
			<div class="border-b border-hairline p-4 lg:border-b-0 lg:border-r lg:p-5">
				<!-- Desktop hero -->
				<div class="hidden lg:block">
					<BelegHero
						belegFileId={data.submission.belegFileId}
						belegMimeType={data.submission.belegMimeType}
						belegOriginalFilename={data.submission.belegOriginalFilename}
						compact={false}
					/>
				</div>
				<!-- Mobile compact -->
				<div class="lg:hidden">
					<BelegHero
						belegFileId={data.submission.belegFileId}
						belegMimeType={data.submission.belegMimeType}
						belegOriginalFilename={data.submission.belegOriginalFilename}
						compact={true}
					/>
				</div>
			</div>

			<!-- RIGHT: facts + decision. -->
			<div class="flex flex-col gap-6 p-4 lg:p-6">
				<ReviewFacts submission={data.submission} />

				{#if isDecided}
					<DecidedBanner
						decision={decisionKind}
						decidedAt={data.decision.decidedAt}
						betragCents={data.submission.betragCents}
						decisionReason={data.decision.decisionReason}
						linkedExpenseId={data.linkedExpense?.id ?? null}
					/>
				{:else}
					<DecisionBand
						submissionId={data.submission.id}
						ausId={data.submission.ausId}
						kategorieOptions={data.kategorieOptions}
						festgeschriebenBis={page.data.festgeschriebenBis}
						currentYear={page.data.currentYear}
					/>
				{/if}
			</div>
		</div>
	</div>
</PageShell>

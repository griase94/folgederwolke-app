<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import MemberInfoCard from '$lib/components/admin/members/MemberInfoCard.svelte';
	import MemberBeitragsTimeline from '$lib/components/admin/members/MemberBeitragsTimeline.svelte';
	import MemberActivityFeed from '$lib/components/admin/members/MemberActivityFeed.svelte';
	import SendReminderSheet from '$lib/components/admin/members/SendReminderSheet.svelte';
	import MarkPaidControl from '$lib/components/admin/members/MarkPaidControl.svelte';
	import { resolveBeitragState, projectForList } from '$lib/domain/beitrag-state.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// Package D: two tabs only — Notizen is dead, remove it from the bar.
	const tabs = [
		{ key: 'beitrag', label: 'Beitrag' },
		{ key: 'aktivitaet', label: 'Aktivität' }
	] as const;
	type TabKey = (typeof tabs)[number]['key'];

	let activeTab = $state<TabKey>('beitrag');
	let reminderSheetOpen = $state(false);

	const fullName = $derived(`${data.member.vorname} ${data.member.nachname}`);

	function switchTab(key: TabKey) {
		activeTab = key;
	}

	function handleTabKeydown(e: KeyboardEvent, currentKey: TabKey) {
		const idx = tabs.findIndex((t) => t.key === currentKey);
		let nextIdx: number | null = null;
		if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
		else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
		if (nextIdx !== null) {
			e.preventDefault();
			const nextKey = tabs[nextIdx]!.key;
			switchTab(nextKey);
			document.getElementById(`tab-${nextKey}`)?.focus();
		}
	}

	// Package D: compute canonical currentYearState for MemberInfoCard + hero.
	// Uses resolveBeitragState (ADR-0001 — only Berlin year from server load).
	const eintrittsJahr = $derived(
		data.member.eintrittsDatum ? Number(data.member.eintrittsDatum.slice(0, 4)) : data.currentYear,
	);
	const austrittsJahr = $derived(
		data.member.austrittsDatum ? Number(data.member.austrittsDatum.slice(0, 4)) : null,
	);

	const currentYearRow = $derived(
		data.currentYearBeitrag
			? {
					betragCents: data.currentYearBeitrag.betragCents,
					paidCents: data.currentYearBeitrag.paidCents,
					isExempt: data.currentYearBeitrag.isExempt,
					gezahltAm: null,
				}
			: null,
	);

	const currentYearState = $derived(
		resolveBeitragState({
			year: data.currentYear,
			eintrittsJahr: eintrittsJahr,
			austrittsJahr: austrittsJahr,
			beitragExempt: data.member.beitragExempt,
			row: currentYearRow,
			satzCents: data.satzByYear[data.currentYear] ?? null,
			festBis: null,
		}),
	);

	const currentYearDisplayState = $derived(projectForList(currentYearState.state));

	// STATUS-DRIVEN sticky bar (Package D — NO FALSE DEBT):
	//   - Reminder only when there's a real open balance
	//   - No reminder for paid/exempt/ausgetreten/pre_eintritt
	const canSendReminder = $derived(
		!!data.member.email &&
			!data.member.beitragExempt &&
			currentYearDisplayState !== 'paid' &&
			currentYearDisplayState !== 'exempt' &&
			currentYearDisplayState !== 'permanently_exempt' &&
			currentYearDisplayState !== 'not_applicable_post_austritt' &&
			currentYearDisplayState !== 'not_applicable_pre_join',
	);

	// Sticky bar shows primary "Zahlung erfassen" CTA for open/partial,
	// secondary "Erinnerung" for open/partial with email.
	const stickyMode = $derived.by((): 'record' | 'reminder-only' | 'none' => {
		if (
			currentYearDisplayState === 'open' ||
			currentYearDisplayState === 'partial'
		) {
			return 'record';
		}
		if (canSendReminder) return 'reminder-only';
		return 'none';
	});
</script>

<svelte:head>
	<title>{fullName} – Mitglieder – {page.data.vereinName}</title>
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<!-- Breadcrumb + back -->
	<nav class="mb-4 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Brotkrümel">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/mitglieder" class="flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Mitglieder
		</a>
		<span aria-hidden="true">/</span>
		<span class="truncate font-medium text-foreground">{fullName}</span>
	</nav>

	<!-- 2-col layout (desktop) / single-col (mobile) -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
		<!-- LEFT: Info card with compact pill -->
		<div class="lg:sticky lg:top-4 lg:self-start">
			<MemberInfoCard
				member={data.member}
				currentYear={data.currentYear}
				{currentYearState}
			/>
		</div>

		<!-- RIGHT: Tab panel -->
		<div class="flex flex-col gap-0">
			<!-- Tab navigation (Package D: 2 tabs, Notizen removed) -->
			<div
				class="mb-4 flex gap-0 rounded-xl border border-border bg-muted/50 p-1"
				role="tablist"
				aria-label="Mitglieds-Abschnitte"
			>
				{#each tabs as tab (tab.key)}
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === tab.key}
						aria-controls="tab-panel-{tab.key}"
						id="tab-{tab.key}"
						tabindex={activeTab === tab.key ? 0 : -1}
						onclick={() => switchTab(tab.key)}
						onkeydown={(e) => handleTabKeydown(e, tab.key)}
						class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
						{activeTab === tab.key
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						{tab.label}
					</button>
				{/each}
			</div>

			<!-- Tab content -->
			<div
				id="tab-panel-beitrag"
				role="tabpanel"
				aria-labelledby="tab-beitrag"
				hidden={activeTab !== 'beitrag'}
			>
				{#if activeTab === 'beitrag'}
					<MemberBeitragsTimeline
						beitrags={data.beitrags}
						memberId={data.member.id}
						memberName={fullName}
						beitragExempt={data.member.beitragExempt}
						beitragExemptReason={data.member.beitragExemptReason}
						eintrittsJahr={eintrittsJahr}
						austrittsJahr={austrittsJahr}
						currentYear={data.currentYear}
						satzByYear={data.satzByYear}
					/>
				{/if}
			</div>

			<div
				id="tab-panel-aktivitaet"
				role="tabpanel"
				aria-labelledby="tab-aktivitaet"
				hidden={activeTab !== 'aktivitaet'}
			>
				{#if activeTab === 'aktivitaet'}
					<MemberActivityFeed
						auditEntries={data.activity.auditEntries}
						sentMails={data.activity.sentMails}
					/>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- STATUS-DRIVEN sticky bar (Package D).
     Mobile (< md): sits above the 56px MobileTabBar + safe-area-inset-bottom.
     On mobile, the hero in MemberBeitragsTimeline ALREADY has the primary
     "Zahlung erfassen" CTA, so the sticky bar is collapsed to reminder only
     (avoid double fixed bars overlapping FAB/tab-bar on phones).
     Desktop (md+): shows the full status-driven action set. -->
{#if stickyMode !== 'none'}
	<div
		class="fixed bottom-[calc(56px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm md:bottom-0 md:pl-[calc(4rem+1px)] lg:pl-[calc(15rem+1px)]"
		data-testid="member-detail-sticky-bar"
	>
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-0 sm:px-2">
			<div class="min-w-0">
				<p class="truncate text-sm font-medium text-foreground">{fullName}</p>
				{#if data.member.email}
					<p class="truncate text-xs text-muted-foreground">{data.member.email}</p>
				{/if}
			</div>

			<div class="flex shrink-0 items-center gap-2">
				<!-- Primary CTA: desktop shows "Zahlung erfassen/bearbeiten"
				     Mobile hides it (hero already covers this, avoids double-bar). -->
				{#if stickyMode === 'record'}
					<div class="hidden md:block">
						<MarkPaidControl
							memberId={data.member.id}
							year={data.currentYear}
							memberName={fullName}
							betragCents={currentYearState.betragCents}
							paidCents={currentYearState.paidCents}
							actionBase="/app/mitglieder"
							allowExempt={false}
						>
							{#snippet trigger({ props })}
								<button
									{...props}
									type="button"
									data-testid="sticky-bar-pay"
									class="flex min-h-10 items-center gap-2 rounded-xl bg-primary-strong px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-strong/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
										<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
									</svg>
									{currentYearDisplayState === 'partial' ? 'Restbetrag erfassen' : 'Zahlung erfassen'}
								</button>
							{/snippet}
						</MarkPaidControl>
					</div>
				{/if}

				<!-- Secondary: Reminder — only when a real balance exists.
				     Status-driven: paid / exempt / ausgetreten → no reminder. -->
				{#if canSendReminder}
					<Button
						variant="outline"
						onclick={() => (reminderSheetOpen = true)}
						disabled={!data.member.email}
						data-testid="sticky-bar-reminder"
						class="shrink-0"
						aria-label="Erinnerungs-Mail vorbereiten für {fullName}"
					>
						<svg
							class="mr-2 h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
							/>
						</svg>
						Erinnerung senden
					</Button>
				{/if}
			</div>
		</div>
	</div>

	<!-- Extra bottom padding so sticky bar doesn't obscure content -->
	<div class="h-20" aria-hidden="true"></div>
{/if}

<!-- Send reminder sheet -->
<SendReminderSheet
	bind:open={reminderSheetOpen}
	member={{
		id: data.member.id,
		vorname: data.member.vorname,
		nachname: data.member.nachname,
		email: data.member.email
	}}
	defaultYear={data.defaultReminderYear}
	defaultBetragCents={data.defaultReminderBetragCents}
	reminderSentRecently={data.reminderSentRecently}
	openYears={data.openYears}
/>

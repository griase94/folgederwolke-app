<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import MemberInfoCard from '$lib/components/admin/members/MemberInfoCard.svelte';
	import MemberBeitragsTimeline from '$lib/components/admin/members/MemberBeitragsTimeline.svelte';
	import MemberActivityFeed from '$lib/components/admin/members/MemberActivityFeed.svelte';
	import SendReminderSheet from '$lib/components/admin/members/SendReminderSheet.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const tabs = [
		{ key: 'beitrag', label: 'Beitrag' },
		{ key: 'aktivitaet', label: 'Aktivität' },
		{ key: 'notizen', label: 'Notizen' }
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
			// Move focus to the newly active tab button
			document.getElementById(`tab-${nextKey}`)?.focus();
		}
	}
</script>

<svelte:head>
	<title>{fullName} – Mitglieder – {page.data.vereinName}</title>
</svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-6 sm:px-6">
	<!-- Breadcrumb + back -->
	<nav class="mb-4 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Brotkrümel">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/mitglieder" class="flex items-center gap-1 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Mitglieder
		</a>
		<span aria-hidden="true">/</span>
		<span class="font-medium text-foreground truncate">{fullName}</span>
	</nav>

	<!-- 2-col layout (desktop) / single-col (mobile) -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
		<!-- LEFT: Info card -->
		<div class="lg:sticky lg:top-4 lg:self-start">
			<MemberInfoCard member={data.member} />
		</div>

		<!-- RIGHT: Tab panel -->
		<div class="flex flex-col gap-0">
			<!-- Tab navigation -->
			<div
				class="flex gap-0 rounded-xl border border-border bg-muted/50 p-1 mb-4"
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
						beitragExempt={data.member.beitragExempt}
						beitragExemptReason={data.member.beitragExemptReason}
						eintrittsJahr={data.member.eintrittsDatum
							? Number(data.member.eintrittsDatum.slice(0, 4))
							: null}
						austrittsJahr={data.member.austrittsDatum
							? Number(data.member.austrittsDatum.slice(0, 4))
							: null}
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

			<div
				id="tab-panel-notizen"
				role="tabpanel"
				aria-labelledby="tab-notizen"
				hidden={activeTab !== 'notizen'}
			>
				{#if activeTab === 'notizen'}
					<Card.Root>
						<Card.Content class="py-10 text-center">
							<svg
								class="mx-auto mb-3 h-8 w-8 text-muted-foreground/40"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
								/>
							</svg>
							<p class="text-sm text-muted-foreground">Notizen kommen in einem späteren Release.</p>
						</Card.Content>
					</Card.Root>
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Sticky CTA bar
     Mobile: sits above the 56px MobileTabBar + safe-area-inset-bottom
     Tablet+: aligned with sidebar width -->
<div
	class="fixed bottom-[calc(56px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm md:bottom-0 md:pl-[calc(4rem+1px)] lg:pl-[calc(15rem+1px)]"
>
	<div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-0 sm:px-2">
		<div class="min-w-0">
			<p class="truncate text-sm font-medium text-foreground">{fullName}</p>
			{#if data.member.email}
				<p class="truncate text-xs text-muted-foreground">{data.member.email}</p>
			{/if}
		</div>
		<Button
			onclick={() => (reminderSheetOpen = true)}
			disabled={!data.member.email || data.member.beitragExempt}
			class="shrink-0"
			aria-label="Erinnerungs-Mail vorbereiten für {fullName}"
			title={data.member.beitragExempt
				? 'Mitglied ist von der Beitragspflicht befreit'
				: undefined}
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
	</div>
</div>

<!-- Extra bottom padding so sticky bar doesn't obscure content -->
<div class="h-20" aria-hidden="true"></div>

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
/>

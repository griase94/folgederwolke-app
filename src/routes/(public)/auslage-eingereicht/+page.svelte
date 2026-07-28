<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { setPreferredAuslage } from '$lib/client/pwa-entry.js';
	import { buildStatusUrl, shareOrCopyStatusLink, type ShareOutcome } from '$lib/client/share-status-link.js';
	import SplitCardShell from '$lib/components/public/SplitCardShell.svelte';
	import TrustJourney from '$lib/components/public/TrustJourney.svelte';
	import StatusMedallion from '$lib/components/ui/StatusMedallion.svelte';
	import AusIdCard from '$lib/components/public/AusIdCard.svelte';
	import BatchConfirmGroup from '$lib/components/public/BatchConfirmGroup.svelte';
	import StatusTimeline from '$lib/components/ui/status-timeline/StatusTimeline.svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Eye from '@lucide/svelte/icons/eye';
	import Link from '@lucide/svelte/icons/link';
	import Plus from '@lucide/svelte/icons/plus';
	import CheckCheck from '@lucide/svelte/icons/check-check';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const isBatch = $derived(data.items.length > 1);
	const firstAus = $derived(data.items[0]?.ausId ?? '');
	const submittedLabel = $derived(new Date(data.submittedAt).toLocaleDateString('de-DE'));

	const journeySteps = $derived([
		{ title: 'Du hast eingereicht', subtitle: isBatch ? `${data.items.length} Auslagen — gerade eben.` : 'Erledigt — gerade eben.' },
		{ title: 'Julia prüft', subtitle: 'Der Vorstand schaut jetzt drüber.' },
		{ title: 'Geld kommt zurück', subtitle: 'Erstattung aufs Konto, meist 1–2 Wochen.' }
	]);

	const timeline = $derived([
		{ title: 'Eingereicht', timestamp: `am ${submittedLabel}`, state: 'done' as const, detail: 'Wir haben deine Auslage erhalten.' },
		{ title: 'Julia prüft', timestamp: 'als Nächstes', state: 'now' as const, detail: 'Der Vorstand schaut sich den Beleg an.' },
		{ title: 'Geld kommt zurück', timestamp: 'danach', state: 'pending' as const, detail: 'Erstattung aufs Konto, meist in 1–2 Wochen.' }
	]);

	let shareState = $state<'idle' | ShareOutcome>('idle');
	const shareLabel = $derived(
		shareState === 'copied' ? 'Link kopiert' : shareState === 'shared' ? 'Link geteilt' : 'Link speichern'
	);
	const shareAnnouncement = $derived(
		shareState === 'copied' ? 'Link kopiert' : shareState === 'shared' ? 'Link geteilt' : ''
	);

	async function onShare() {
		const urlStr = buildStatusUrl(firstAus, page.url.origin);
		shareState = await shareOrCopyStatusLink(urlStr, page.data.vereinName);
	}

	onMount(async () => {
		// PWA-entry stickiness + draft clear (submission succeeded).
		setPreferredAuslage();
		const { clearDraft } = await import('$lib/client/drafts.js');
		await clearDraft();
		// Rotate ALL batch nonces so "Weitere Auslage" starts fresh (each block
		// stored fdw-auslage-submission-nonce:<clientKey>).
		try {
			for (const key of Object.keys(sessionStorage)) {
				if (key.startsWith('fdw-auslage-submission-nonce')) sessionStorage.removeItem(key);
			}
		} catch {
			/* sessionStorage unavailable — nothing to rotate */
		}
	});
</script>

<svelte:head><title>Auslage eingereicht — {page.data.vereinName}</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-3 py-6 lg:px-6 lg:py-10">
	<SplitCardShell center>
		{#snippet aside()}
			<div>
				<span class="text-[11px] font-bold tracking-wide text-ink-500 uppercase">{isBatch ? 'Auslagen eingereicht' : 'Auslage eingereicht'}</span>
				<h1 class="mt-3 text-[26px] leading-[1.1] font-extrabold tracking-tight text-ink-900">
					{isBatch ? 'Alles drin — jede mit eigener Nummer.' : 'Danke, dass du in Vorkasse gegangen bist.'}
				</h1>
				<p class="mt-3 max-w-[32ch] text-[14px] leading-relaxed text-ink-500">
					{isBatch
						? 'Julia prüft jede für sich — du verfolgst alle auf einer Seite.'
						: 'Wir haben deine Auslage — jetzt übernehmen wir. Du musst nichts weiter tun.'}
				</p>
			</div>
			<div class="mt-auto hidden lg:block">
				<TrustJourney steps={journeySteps} doneUntil={1} trust="Wir melden uns per E-Mail bei jedem Schritt." />
			</div>
		{/snippet}
		{#snippet main()}
			<div class="mx-auto flex w-full max-w-[420px] flex-col items-center text-center">
				<StatusMedallion class="mb-5" tone="done" size="lg">{#snippet icon()}<CircleCheck />{/snippet}</StatusMedallion>
				<h2 tabindex="-1" class="text-[24px] font-extrabold tracking-tight text-ink-900 outline-none" data-testid="eingereicht-heading">
					{isBatch ? `Alles drin, ${data.vorname} — ${data.items.length} Auslagen unterwegs.` : `Hat geklappt, ${data.vorname}!`}
				</h2>
				<p class="mt-2.5 max-w-[38ch] text-[14px] leading-relaxed text-ink-500">
					{isBatch
						? 'Sie sind bei uns gelandet, jede mit eigener Nummer. Du musst jetzt nichts weiter tun.'
						: 'Du musst jetzt nichts weiter tun — wir melden uns, sobald geprüft ist.'}
				</p>

				{#if isBatch}
					<BatchConfirmGroup class="mt-6" items={data.items} gesamtCents={data.gesamtCents} />
				{:else}
					<AusIdCard class="mt-6" ausId={firstAus} betragCents={data.gesamtCents} belegName={data.belegName} />
				{/if}

				<div class="mt-6 w-full text-left">
					<div class="mb-3.5 text-[11px] font-bold tracking-wide text-ink-500 uppercase">Was jetzt passiert</div>
					<StatusTimeline events={timeline} />
				</div>

				<div class="mt-6 flex w-full flex-col gap-2.5">
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						href={data.statusUrl}
						data-testid="status-cta"
						class="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[10px] [background-image:var(--gradient-brand)] px-5 text-[15px] font-semibold text-white shadow-[var(--glow-brand)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none [&_svg]:size-4"
					>
						<Eye aria-hidden="true" />{isBatch ? 'Alle Status verfolgen' : 'Status verfolgen'}
					</a>
					<button
						type="button"
						onclick={onShare}
						data-testid="share-status-link"
						class="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[10px] border border-hairline bg-card px-5 text-sm font-semibold {shareState === 'idle' ? 'text-primary-text' : 'text-type-einnahme'} transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4"
					>
						{#if shareState === 'idle'}<Link aria-hidden="true" />{:else}<CheckCheck aria-hidden="true" />{/if}{shareLabel}
					</button>
					<a
						href="/auslage-einreichen"
						class="mt-1 inline-flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-primary-text no-underline hover:opacity-80 [&_svg]:size-3.5"
					>
						<Plus aria-hidden="true" />Weitere Auslage einreichen
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</div>

				<p class="mt-5 w-full border-t border-hairline pt-4 text-left text-[12px] leading-relaxed text-ink-500">
					{#if isBatch}
						Jede deiner Nummern öffnet die ganze Gruppe — Hauptsache, du hast eine parat. Fang mit
						<b class="font-bold text-ink-700 tabular-nums whitespace-nowrap">{firstAus}</b> an.
					{:else}
						Halt deine Nummer <b class="font-bold text-ink-700 tabular-nums whitespace-nowrap">{firstAus}</b> bereit — damit findest du deinen Status jederzeit wieder.
					{/if}
				</p>
				<p class="sr-only" aria-live="polite" aria-atomic="true">{shareAnnouncement}</p>
			</div>
		{/snippet}
	</SplitCardShell>
</main>

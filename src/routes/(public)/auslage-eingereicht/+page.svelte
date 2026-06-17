<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { setPreferredAuslage } from '$lib/client/pwa-entry.js';
	import {
		buildStatusUrl,
		shareOrCopyStatusLink,
		type ShareOutcome
	} from '$lib/client/share-status-link.js';

	const ausId = $derived(page.url.searchParams.get('id') ?? '');

	let shareState = $state<'idle' | ShareOutcome>('idle');
	let shareUrl = $state('');

	onMount(async () => {
		// A completed submission is the strongest "this device files expenses"
		// signal — make the Auslage form this device's sticky launch entry so a
		// returning external lands straight on it. Harmless for authed devices:
		// the launch router ignores the preference once hasAuthedBefore is set.
		setPreferredAuslage();

		// Clear the IndexedDB draft now that submission succeeded.
		// Dynamic import because clearDraft uses IndexedDB (browser-only).
		const { clearDraft } = await import('$lib/client/drafts.js');
		await clearDraft();

		// Rotate the idempotency nonce: this submission succeeded, so a NEW
		// Auslage started from "Weitere Auslage einreichen" must get a fresh
		// nonce (otherwise it would dedup to this one). Clearing the
		// sessionStorage key makes AuslagenForm seed a new UUID on its next
		// mount. Must match the key in AuslagenForm.svelte
		// (fdw-auslage-submission-nonce).
		try {
			sessionStorage.removeItem('fdw-auslage-submission-nonce');
		} catch {
			// sessionStorage unavailable (private mode) — nothing to rotate.
		}
	});

	async function onShare() {
		// WhatsApp in-app browsers lose the URL on close; the confirmation mail
		// also carries the link — this is the belt to that suspender (spec §6).
		const url = buildStatusUrl(ausId, page.url.origin);
		shareUrl = url;
		shareState = await shareOrCopyStatusLink(url, page.data.vereinName);
	}

	const shareLabel = $derived(
		shareState === 'copied'
			? 'Link kopiert ✓'
			: shareState === 'shared'
				? 'Link geteilt ✓'
				: 'Link speichern'
	);
</script>

<svelte:head>
	<title>Auslage eingereicht – {page.data.vereinName}</title>
</svelte:head>

<main class="mx-auto w-full max-w-2xl px-4 py-12 lg:px-6 lg:py-16">
	<div class="mb-8 flex items-center gap-3">
		<span
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full [background-image:var(--gradient-brand-soft)] text-xl"
			aria-hidden="true">✓</span
		>
		<h1 class="text-3xl font-bold tracking-tight text-ink-900">Vielen Dank!</h1>
	</div>

	{#if ausId}
		<p class="mb-6 text-lg text-ink-700">Deine Auslage wurde erfolgreich eingereicht.</p>

		<div
			class="mb-8 rounded-2xl border border-[var(--hairline)] bg-card px-6 py-4 shadow-[var(--shadow-card)]"
		>
			<p class="mb-1 text-sm font-medium tracking-wide text-ink-500 uppercase">
				Deine Einreichungs-ID
			</p>
			<p class="font-mono text-2xl font-bold text-ink-900">{ausId}</p>
		</div>

		<p class="mb-5 leading-relaxed text-ink-700">
			Der Vorstand prüft deine Auslage. Sobald sie freigegeben ist, wird der Betrag überwiesen — den Stand siehst du jederzeit unter deinem Status-Link.
		</p>

		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<div class="flex flex-wrap items-center gap-3">
			<a
				href="/auslage-status/{ausId}"
				class="inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary-strong px-5 text-sm font-semibold text-white shadow-[var(--glow-brand)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none lg:h-10"
			>
				Status verfolgen →
			</a>
			<button
				type="button"
				onclick={onShare}
				data-testid="share-status-link"
				class="inline-flex h-11 items-center gap-2 rounded-[10px] border border-[var(--hairline)] bg-card px-5 text-sm font-semibold text-primary-text transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none lg:h-10"
			>
				{shareLabel}
			</button>
		</div>
		{#if shareState === 'failed'}
			<p class="mt-3 text-xs break-all text-ink-500">
				Konnte nicht automatisch gespeichert werden — Link zum Kopieren:
				<span class="font-mono" data-testid="share-url-fallback">{shareUrl}</span>
			</p>
		{/if}

		<p class="mt-8">
			<a
				href="/auslage-einreichen"
				class="text-sm font-medium text-primary-text underline underline-offset-2 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				Weitere Auslage einreichen
			</a>
		</p>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{:else}
		<p class="mb-6 text-ink-500">
			Deine Einreichung wurde gespeichert. Falls du eine Bestätigungs-E-Mail erwartest, prüfe
			bitte deinen Posteingang.
		</p>

		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href="/auslage-einreichen"
			class="inline-flex h-11 items-center gap-2 rounded-[10px] bg-primary-strong px-5 text-sm font-semibold text-white shadow-[var(--glow-brand)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none lg:h-10"
		>
			Weitere Auslage einreichen
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{/if}

	<div class="mt-12 border-t border-[var(--hairline)] pt-8">
		<p class="text-sm text-ink-500">
			Bei Fragen wende dich an den Vorstand von {page.data.vereinName}. Bitte halte deine
			Einreichungs-ID bereit.
		</p>
	</div>
</main>

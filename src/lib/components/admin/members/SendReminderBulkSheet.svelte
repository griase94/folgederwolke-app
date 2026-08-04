<script lang="ts">
	/**
	 * SendReminderBulkSheet — the ONE reminder surface (erinnerung-senden brief).
	 * A single recipient is just the n=1 case (Ruling C6a), so this replaces the
	 * old single SendReminderSheet ersatzlos. Composes the S1 trio
	 * (ReminderRecipientRow / RecipientPager / PlaceholderEditor) + the Kit
	 * DateField, and renders the preview from the SAME copy single-source as the
	 * mail template (`beitrag-reminder-copy`) so the Vorschau is byte-identical to
	 * the sent mail (AC8 — the mandatory copy-equality gate).
	 *
	 * Posts to `?/send-reminder-bulk` and shows an honest per-recipient result
	 * digest (sent / skipped / failed). The false-debt guard + the (member, year)
	 * dedup live server-side (sendBeitragReminderBulk) — the CARDINAL RULE.
	 */
	import { deserialize } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DateField from '$lib/components/ui/date-field/DateField.svelte';
	import ReminderRecipientRow from './ReminderRecipientRow.svelte';
	import RecipientPager from './RecipientPager.svelte';
	import PlaceholderEditor from './PlaceholderEditor.svelte';
	import type { ReminderCandidate } from '$lib/domain/reminder-candidate.js';
	import {
		reminderSubject,
		standardReminderIntro,
		resolveReminderIntro,
		reminderVerwendungszweck,
		reminderSinnAbsatz,
		REMINDER_SOLIDAR_ABSATZ,
		REMINDER_ZUORDNUNG_WARN,
		formatReminderEuro
	} from '$lib/domain/beitrag-reminder-copy.js';
	import { berlinYmd } from '$lib/domain/year.js';

	let {
		open = $bindable(false),
		candidates,
		year,
		vereinName,
		iban = null,
		onSuccess
	}: {
		open?: boolean;
		/** Owing candidates for `year` (loadReminderCandidates). n=1 for the single entry. */
		candidates: ReminderCandidate[];
		year: number;
		/** Empfänger in the bank-fact block (Verein name). */
		vereinName: string;
		/** Verein IBAN for the fact block; null → the row is omitted. */
		iban?: string | null;
		onSuccess?: () => void;
	} = $props();

	type Digest = {
		sent: string[];
		skippedNoMail: string[];
		skippedDeduped: string[];
		skippedNoDebt: string[];
		failed: string[];
	};

	let phase = $state<'compose' | 'sending' | 'result'>('compose');
	let digest = $state<Digest | null>(null);

	const selected = new SvelteSet<string>();
	let fristIso = $state('');
	let editing = $state(false);
	let introDraft = $state('');
	let pagerIndex = $state(0);

	function defaultFristIso(): string {
		// Today (Berlin) + 14 days — the brief default "Zahlbar bis". Timestamp
		// math (no mutable Date) keeps svelte/prefer-svelte-reactivity happy.
		const ms = Date.parse(`${berlinYmd()}T00:00:00Z`) + 14 * 86_400_000;
		return new Date(ms).toISOString().slice(0, 10);
	}

	// Reset the whole sheet each time it opens (pre-select all selectable).
	$effect(() => {
		if (open) {
			phase = 'compose';
			digest = null;
			editing = false;
			pagerIndex = 0;
			fristIso = defaultFristIso();
			selected.clear();
			for (const c of candidates) if (c.selectable) selected.add(c.memberId);
			introDraft = standardReminderIntro(true);
		}
	});

	const hasFrist = $derived(fristIso.trim() !== '');
	const standardIntro = $derived(standardReminderIntro(hasFrist));
	// Dirty = the draft differs from BOTH standard variants (with/without Frist),
	// so toggling the Frist on an unedited draft never counts as an edit.
	const introDirty = $derived(
		introDraft !== standardReminderIntro(true) && introDraft !== standardReminderIntro(false)
	);
	// The template actually sent: the edited draft, or the current standard.
	const effectiveIntroTemplate = $derived(introDirty ? introDraft : standardIntro);

	const selectableCount = $derived(candidates.filter((c) => c.selectable).length);
	const selectedCandidates = $derived(candidates.filter((c) => selected.has(c.memberId)));
	const selectedCount = $derived(selectedCandidates.length);
	const summaryOpenCents = $derived(selectedCandidates.reduce((s, c) => s + c.openCents, 0));
	const pagerNames = $derived(selectedCandidates.map((c) => c.name));
	const previewCandidate = $derived(
		selectedCandidates[Math.min(pagerIndex, Math.max(0, selectedCount - 1))] ?? null
	);

	function splitName(name: string): { vorname: string; nachname: string } {
		const parts = name.trim().split(/\s+/);
		return { vorname: parts[0] ?? '', nachname: parts.slice(1).join(' ') };
	}

	// The resolved preview for the currently-paged recipient. Every string comes
	// from the shared copy module → identical to the rendered BeitragsReminder mail.
	const preview = $derived.by(() => {
		const c = previewCandidate;
		if (!c) return null;
		const { vorname, nachname } = splitName(c.name);
		return {
			to: c.email ?? '',
			subject: reminderSubject(year),
			intro: resolveReminderIntro(effectiveIntroTemplate, {
				vorname,
				jahr: year,
				betragCents: c.betragCents,
				fristAt: hasFrist ? fristIso : null
			}),
			betragFmt: formatReminderEuro(c.betragCents),
			verwendungszweck: reminderVerwendungszweck(vorname, nachname, year),
			warn: REMINDER_ZUORDNUNG_WARN,
			sinn: reminderSinnAbsatz(vereinName),
			solidar: REMINDER_SOLIDAR_ABSATZ
		};
	});

	const summaryFmt = $derived(formatReminderEuro(summaryOpenCents));
	const ctaLabel = $derived(
		selectedCount === 1 ? 'Erinnerung senden' : `${selectedCount} Erinnerungen senden`
	);
	const canSend = $derived(phase === 'compose' && selectedCount > 0);
	const gateReason = $derived(
		candidates.length === 0
			? 'Niemand säumig — nix zu erinnern.'
			: selectableCount === 0
				? 'Kein:e Empfänger:in wählbar (keine E-Mail oder kürzlich erinnert).'
				: selectedCount === 0
					? 'Fehlt noch: mindestens eine:n Empfänger:in wählen.'
					: null
	);

	function toggle(memberId: string, checked: boolean) {
		if (checked) selected.add(memberId);
		else selected.delete(memberId);
	}

	async function send() {
		if (!canSend) return;
		phase = 'sending';
		try {
			const fd = new FormData();
			for (const c of selectedCandidates) fd.append('memberId', c.memberId);
			fd.set('year', String(year));
			fd.set('fristAt', hasFrist ? fristIso : '');
			if (introDirty) fd.set('customIntro', introDraft);
			const res = await fetch('?/send-reminder-bulk', { method: 'POST', body: fd });
			const result = deserialize(await res.text());
			if (result.type === 'success') {
				const d = result.data as Partial<Digest> | undefined;
				digest = {
					sent: d?.sent ?? [],
					skippedNoMail: d?.skippedNoMail ?? [],
					skippedDeduped: d?.skippedDeduped ?? [],
					skippedNoDebt: d?.skippedNoDebt ?? [],
					failed: d?.failed ?? []
				};
				phase = 'result';
				onSuccess?.();
			} else {
				const msg =
					result.type === 'failure'
						? ((result.data?.['error'] as string | undefined) ?? 'Senden fehlgeschlagen.')
						: 'Senden fehlgeschlagen.';
				toast.error(msg);
				phase = 'compose';
			}
		} catch {
			toast.error('Senden fehlgeschlagen.');
			phase = 'compose';
		}
	}

	// Result-state summary line ("N gesendet · M übersprungen · K fehlgeschlagen").
	const skippedTotal = $derived(
		digest
			? digest.skippedNoMail.length + digest.skippedDeduped.length + digest.skippedNoDebt.length
			: 0
	);
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]"
		data-testid="bulk-reminder-sheet"
	>
		<Dialog.Header class="border-b border-border px-6 py-4">
			<Dialog.Title class="text-lg font-bold">Erinnerungen senden</Dialog.Title>
			<Dialog.Description>
				Beitrags-Erinnerung für {year} — sonnig, nie mahnend. Nichts geht raus ohne Vorschau.
			</Dialog.Description>
		</Dialog.Header>

		{#if phase === 'result' && digest}
			<!-- ── Result state ─────────────────────────────────────────────── -->
			<div class="flex-1 overflow-y-auto px-6 py-5" data-testid="bulk-reminder-result">
				<div
					class="mb-4 rounded-xl border border-safe-border bg-safe-surface px-4 py-3 text-sm text-safe-ink"
				>
					<p class="font-semibold" data-testid="bulk-reminder-result-summary">
						{digest.sent.length}
						{digest.sent.length === 1 ? 'Erinnerung' : 'Erinnerungen'} gesendet{#if skippedTotal > 0}
							· {skippedTotal} übersprungen{/if}{#if digest.failed.length > 0}
							· {digest.failed.length} fehlgeschlagen{/if}
					</p>
				</div>
				<ul class="space-y-1.5 text-sm text-muted-foreground">
					{#if digest.skippedDeduped.length > 0}
						<li>{digest.skippedDeduped.length}× schon erinnert (30-Tage-Schutz)</li>
					{/if}
					{#if digest.skippedNoMail.length > 0}
						<li>{digest.skippedNoMail.length}× ohne E-Mail übersprungen</li>
					{/if}
					{#if digest.skippedNoDebt.length > 0}
						<li>{digest.skippedNoDebt.length}× nichts offen — übersprungen</li>
					{/if}
					{#if digest.failed.length > 0}
						<li class="text-severity-warn-text">
							{digest.failed.length}× fehlgeschlagen — bitte später erneut versuchen
						</li>
					{/if}
				</ul>
			</div>
			<div class="border-t border-border px-6 py-4">
				<Button class="w-full" onclick={() => (open = false)} data-testid="bulk-reminder-close">
					Schließen
				</Button>
			</div>
		{:else if candidates.length === 0}
			<!-- ── Empty state ──────────────────────────────────────────────── -->
			<div class="flex-1 px-6 py-10 text-center" data-testid="bulk-reminder-empty">
				<p class="text-sm text-muted-foreground">Niemand säumig — nix zu erinnern. ☁</p>
			</div>
			<div class="border-t border-border px-6 py-4">
				<Button class="w-full" variant="outline" onclick={() => (open = false)}>Schließen</Button>
			</div>
		{:else}
			<!-- ── Compose ──────────────────────────────────────────────────── -->
			<div class="flex-1 space-y-6 overflow-y-auto px-6 py-5">
				<!-- Recipients -->
				<section class="space-y-2">
					<h3 class="text-sm font-medium text-foreground">Empfänger:innen</h3>
					<div class="space-y-1.5" data-testid="bulk-reminder-recipients">
						{#each candidates as c (c.memberId)}
							<ReminderRecipientRow
								candidate={c}
								checked={selected.has(c.memberId)}
								onCheckedChange={(v) => toggle(c.memberId, v)}
							/>
						{/each}
					</div>
				</section>

				<!-- Frist -->
				<section class="space-y-2">
					<h3 class="text-sm font-medium text-foreground">Zahlbar bis</h3>
					<div class="flex items-center gap-2">
						<div class="w-40" data-testid="bulk-reminder-frist">
							<DateField
								name="fristAt-display"
								value={fristIso}
								onchange={(iso) => (fristIso = iso)}
							/>
						</div>
						<button
							type="button"
							onclick={() => (fristIso = defaultFristIso())}
							class="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-ink-500 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							14 Tage
						</button>
					</div>
				</section>

				<!-- Message -->
				<section class="space-y-2">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-medium text-foreground">Nachricht</h3>
						{#if !editing}
							<button
								type="button"
								onclick={() => (editing = true)}
								data-testid="bulk-reminder-edit-toggle"
								class="text-xs font-medium text-primary-text hover:underline"
							>
								Nachricht bearbeiten
							</button>
						{/if}
					</div>
					{#if editing}
						<PlaceholderEditor bind:value={introDraft} standardText={standardIntro} />
					{:else}
						<p
							class="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground"
							data-testid="bulk-reminder-standard-intro"
						>
							{standardIntro}
						</p>
					{/if}
				</section>

				<!-- Preview -->
				{#if preview}
					<section class="space-y-2">
						<div class="flex items-center justify-between">
							<h3 class="text-sm font-medium text-foreground">Vorschau</h3>
							{#if selectedCount > 1}
								<RecipientPager names={pagerNames} bind:index={pagerIndex} />
							{/if}
						</div>
						<div class="space-y-3 rounded-xl border border-border bg-card p-4 text-sm">
							<div class="space-y-1">
								<div class="flex gap-2">
									<span class="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">An</span>
									<span class="min-w-0 break-all text-foreground">{preview.to}</span>
								</div>
								<div class="flex gap-2">
									<span class="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Betreff</span>
									<span class="text-foreground" data-testid="bulk-reminder-preview-subject">{preview.subject}</span>
								</div>
							</div>
							<p class="border-t border-border pt-3 text-foreground" data-testid="bulk-reminder-preview-intro">
								{preview.intro}
							</p>
							<!-- Bank-fact block (server-fixed; only the intro above is editable) -->
							<div class="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/25 dark:bg-amber-500/10">
								<div class="grid grid-cols-[130px_1fr] gap-1 text-xs">
									<span class="text-amber-700 dark:text-amber-300">Empfänger</span>
									<span class="font-medium text-amber-900 dark:text-amber-100">{vereinName}</span>
								</div>
								{#if iban}
									<div class="grid grid-cols-[130px_1fr] gap-1 text-xs">
										<span class="text-amber-700 dark:text-amber-300">IBAN</span>
										<span class="font-mono text-amber-900 dark:text-amber-100">{iban}</span>
									</div>
								{/if}
								<div class="grid grid-cols-[130px_1fr] gap-1 text-xs">
									<span class="text-amber-700 dark:text-amber-300">Betrag</span>
									<span class="font-bold text-amber-900 dark:text-amber-100" data-testid="bulk-reminder-preview-betrag">{preview.betragFmt}</span>
								</div>
								<div class="grid grid-cols-[130px_1fr] gap-1 text-xs">
									<span class="text-amber-700 dark:text-amber-300">Verwendungszweck</span>
									<span class="font-mono font-medium text-amber-900 dark:text-amber-100" data-testid="bulk-reminder-preview-zweck">{preview.verwendungszweck}</span>
								</div>
							</div>
							<p class="text-xs italic text-muted-foreground">{preview.warn}</p>
							<p class="text-muted-foreground">{preview.sinn}</p>
							<p class="text-muted-foreground" data-testid="bulk-reminder-preview-solidar">{preview.solidar}</p>
						</div>
					</section>
				{/if}
			</div>

			<!-- ── Single-axis footer (never jumps) ─────────────────────────── -->
			<div class="border-t border-border px-6 py-4">
				{#if gateReason}
					<p class="mb-2 text-xs text-muted-foreground" data-testid="bulk-reminder-gate">{gateReason}</p>
				{/if}
				<div class="grid grid-cols-[1fr_auto] items-center gap-3">
					<p class="text-sm text-muted-foreground" data-testid="bulk-reminder-summary" aria-live="polite">
						{selectedCount}
						{selectedCount === 1 ? 'Empfänger:in' : 'Empfänger:innen'} · {summaryFmt} offen
					</p>
					<div class="flex items-center gap-2">
						<Button variant="outline" onclick={() => (open = false)} disabled={phase === 'sending'}>
							Abbrechen
						</Button>
						<Button onclick={send} disabled={!canSend} data-testid="bulk-reminder-send">
							{phase === 'sending' ? 'Erinnerungen gehen raus …' : ctaLabel}
						</Button>
					</div>
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

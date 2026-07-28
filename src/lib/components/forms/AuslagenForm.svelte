<script lang="ts">
	// Public Auslage BATCH form (Aurora A-flow S1). Extern-only (no payer radio —
	// members self-serve in the portal), multi-Auslage: one identity, N blocks,
	// one confirmation. Submits multipart via use:enhance (the repeater needs JS
	// anyway): `data` = JSON batch payload, `beleg_<i>` = each block's compressed
	// Beleg. F1 (betrag>0), F2 (hide "+ weitere" at maxBatchItems), F3 (IBAN) are
	// enforced form-level here and re-checked server-side.
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import AmountField from '$lib/components/ui/hero-field/AmountField.svelte';
	import DateField from '$lib/components/ui/hero-field/DateField.svelte';
	import BelegUpload from './BelegUpload.svelte';
	import AuslageBlock from './AuslageBlock.svelte';
	import BatchReviewList from './BatchReviewList.svelte';
	import Callout from '$lib/components/public/Callout.svelte';
	import LoginNudge from '$lib/components/public/LoginNudge.svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { datenschutzText, DATENSCHUTZ_VERSION } from '$lib/domain/datenschutz.js';
	import {
		makeDebouncedSave,
		saveBatchDraft,
		loadBatchDraft,
		clearDraft
	} from '$lib/client/drafts.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Send from '@lucide/svelte/icons/send';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Info from '@lucide/svelte/icons/info';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';

	interface Project {
		id: string;
		name: string;
	}

	interface Props {
		action?: string;
		projects?: Project[];
		maxBatchItems?: number;
		serverError?: string | null;
		formErrors?: string[] | null;
		identityErrors?: Record<string, string[]> | null;
		itemErrors?: Record<string, Record<string, string[]>> | null;
		initialBezeichnung?: string;
		initialKommentar?: string;
	}

	let {
		action = '',
		projects = [],
		maxBatchItems = 10,
		serverError = null,
		formErrors = null,
		identityErrors = null,
		itemErrors = null,
		initialBezeichnung = '',
		initialKommentar = ''
	}: Props = $props();

	// ── block model ───────────────────────────────────────────────────────────
	interface Block {
		clientKey: string;
		nonce: string;
		bezeichnung: string;
		betragCents: number | null;
		rechnungsdatum: string; // ISO YYYY-MM-DD
		wofuer: string;
		kommentar: string;
		file: File | null;
		open: boolean;
	}

	const NONCE_PREFIX = 'fdw-auslage-submission-nonce';
	function loadNonce(clientKey: string): string {
		if (!browser) return crypto.randomUUID();
		try {
			const key = `${NONCE_PREFIX}:${clientKey}`;
			const existing = sessionStorage.getItem(key);
			if (existing) return existing;
			const fresh = crypto.randomUUID();
			sessionStorage.setItem(key, fresh);
			return fresh;
		} catch {
			return crypto.randomUUID();
		}
	}

	let blockSeq = 0;
	function newBlock(seed?: Partial<Block>): Block {
		const clientKey = `b${Date.now().toString(36)}-${blockSeq++}`;
		return {
			clientKey,
			nonce: loadNonce(clientKey),
			bezeichnung: seed?.bezeichnung ?? '',
			betragCents: seed?.betragCents ?? null,
			rechnungsdatum: seed?.rechnungsdatum ?? '',
			wofuer: seed?.wofuer ?? '',
			kommentar: seed?.kommentar ?? '',
			file: seed?.file ?? null,
			open: true
		};
	}

	// ── state ─────────────────────────────────────────────────────────────────
	let externName = $state('');
	let externEmail = $state('');
	let externIban = $state('');
	let consent = $state(false);
	// One-time share-prefill seed of block 1 (PWA share_target); later edits are
	// user-driven. Draft restore (onMount) replaces the array outright.
	// svelte-ignore state_referenced_locally
	let blocks = $state<Block[]>([
		newBlock({ bezeichnung: initialBezeichnung, kommentar: initialKommentar })
	]);

	let submitting = $state(false);
	let offlineError = $state(false);
	let draftRestored = $state(false);
	let attempted = $state(false); // becomes true after first submit attempt (shows errors)

	const todayIso = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

	function centsToInput(cents: number | null): string {
		return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');
	}

	// ── validation (F1/F3 form-level) ──────────────────────────────────────────
	const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	const identityValid = $derived(
		externName.trim().length > 0 &&
			emailRe.test(externEmail.trim()) &&
			externIban.replace(/\s+/g, '').length >= 15
	);
	function blockValid(b: Block): boolean {
		return (
			b.bezeichnung.trim().length >= 3 &&
			b.betragCents != null &&
			b.betragCents > 0 && // F1
			/^\d{4}-\d{2}-\d{2}$/.test(b.rechnungsdatum) &&
			b.file != null
		);
	}
	function blockComplete(b: Block): boolean {
		return blockValid(b);
	}
	const allValid = $derived(blocks.every(blockValid));
	const formValid = $derived(identityValid && allValid && consent);
	const gesamtCents = $derived(
		blocks.reduce((s, b) => s + (blockValid(b) ? (b.betragCents ?? 0) : 0), 0)
	);
	const canAddMore = $derived(blocks.length < maxBatchItems); // F2

	// server per-field errors (only surfaced after an attempt)
	function identityError(field: string): string | undefined {
		return attempted ? identityErrors?.[field]?.[0] : undefined;
	}
	function itemError(clientKey: string, field: string): string | undefined {
		return attempted ? itemErrors?.[clientKey]?.[field]?.[0] : undefined;
	}

	// ── batch operations ────────────────────────────────────────────────────────
	function addBlock() {
		if (!canAddMore) return;
		// collapse valid blocks so the new one is the focus
		for (const b of blocks) if (blockValid(b)) b.open = false;
		blocks.push(newBlock());
		triggerSave();
	}
	function removeBlock(clientKey: string) {
		if (blocks.length === 1) return;
		const b = blocks.find((x) => x.clientKey === clientKey);
		const hasContent = b && (b.bezeichnung || b.betragCents != null || b.file);
		if (hasContent && !confirm('Diese Auslage entfernen?')) return;
		if (browser) {
			try {
				sessionStorage.removeItem(`${NONCE_PREFIX}:${clientKey}`);
			} catch {
				/* ignore */
			}
		}
		blocks = blocks.filter((x) => x.clientKey !== clientKey);
		triggerSave();
	}
	function editBlock(clientKey: string) {
		const b = blocks.find((x) => x.clientKey === clientKey);
		if (b) b.open = true;
	}
	function toggleBlock(clientKey: string) {
		const b = blocks.find((x) => x.clientKey === clientKey);
		if (b) b.open = !b.open;
	}

	// ── draft persistence ────────────────────────────────────────────────────────
	const debouncedSave = makeDebouncedSave(1000);
	function draftPayload() {
		return {
			identity: { name: externName, email: externEmail, iban: externIban },
			blocks: blocks.map((b) => ({
				clientKey: b.clientKey,
				bezeichnung: b.bezeichnung,
				betragCents: b.betragCents,
				rechnungsdatum: b.rechnungsdatum,
				wofuer: b.wofuer,
				kommentar: b.kommentar
			}))
		};
	}
	function draftFiles(): Record<string, File> {
		const out: Record<string, File> = {};
		for (const b of blocks) if (b.file) out[b.clientKey] = b.file;
		return out;
	}
	function triggerSave() {
		if (browser) debouncedSave(draftPayload(), draftFiles());
	}

	onMount(() => {
		loadBatchDraft().then((draft) => {
			if (!draft) return;
			externName = draft.metadata.identity.name ?? '';
			externEmail = draft.metadata.identity.email ?? '';
			externIban = draft.metadata.identity.iban ?? '';
			if (draft.metadata.blocks.length > 0) {
				blocks = draft.metadata.blocks.map((mb) =>
					newBlock({
						bezeichnung: mb.bezeichnung,
						betragCents: mb.betragCents,
						rechnungsdatum: mb.rechnungsdatum,
						wofuer: mb.wofuer,
						kommentar: mb.kommentar,
						file: draft.files[mb.clientKey] ?? null
					})
				);
				draftRestored = true;
			}
		});
	});

	beforeNavigate(() => {
		if (browser && !submitting) void saveBatchDraft(draftPayload(), draftFiles());
	});

	function discardDraft() {
		draftRestored = false;
		void clearDraft();
		externName = '';
		externEmail = '';
		externIban = '';
		blocks = [newBlock()];
	}

	// ── submit (use:enhance builds the multipart payload) ─────────────────────────
	const submit = () => {
		attempted = true;
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			offlineError = true;
			void saveBatchDraft(draftPayload(), draftFiles());
			return { cancelled: true };
		}
		offlineError = false;
		if (!formValid) {
			// expand the first invalid block + scroll to it
			const firstInvalid = blocks.find((b) => !blockValid(b));
			if (firstInvalid) firstInvalid.open = true;
			return { cancelled: true };
		}
		return { ok: true };
	};

	function buildData(): string {
		return JSON.stringify({
			identity: {
				name: externName.trim(),
				iban: externIban.replace(/\s+/g, ''),
				email: externEmail.trim()
			},
			consent_text_version: DATENSCHUTZ_VERSION,
			auslagen: blocks.map((b) => ({
				client_key: b.clientKey,
				submission_nonce: b.nonce,
				bezeichnung: b.bezeichnung.trim(),
				kommentar: b.kommentar.trim() || null,
				rechnungsdatum: b.rechnungsdatum,
				betrag_cents: b.betragCents ?? 0,
				wofuer: b.wofuer.trim() || null
			}))
		});
	}

	// CTA label (pluralized + summed)
	const ctaLabel = $derived.by(() => {
		const n = blocks.length;
		const noun = n === 1 ? 'Auslage einreichen' : `${n} Auslagen einreichen`;
		return formValid ? `${noun} — ${formatMoney(gesamtCents)}` : noun;
	});
	const missingHint = $derived.by(() => {
		if (!identityValid) return 'Bitte zuerst Name, E-Mail und IBAN ausfüllen.';
		const bad = blocks.findIndex((b) => !blockValid(b));
		if (bad >= 0) return `Fehlt noch: Beleg, Betrag & Datum für Auslage ${bad + 1}.`;
		if (!consent) return 'Bitte den Datenschutzhinweis bestätigen.';
		return '';
	});
</script>

{#snippet fieldError(id: string, msg: string | undefined)}
	{#if msg}
		<p {id} class="text-xs text-severity-critical-text" role="alert">{msg}</p>
	{/if}
{/snippet}

{#snippet blockFields(block: Block)}
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-1.5">
			<Label for="bez-{block.clientKey}">Was war's <span class="text-primary-text" aria-hidden="true">*</span></Label>
			<Input
				id="bez-{block.clientKey}"
				type="text"
				maxlength={200}
				placeholder="z. B. Getränke fürs Sommerfest"
				bind:value={block.bezeichnung}
				oninput={triggerSave}
				aria-invalid={Boolean(itemError(block.clientKey, 'bezeichnung'))}
			/>
			{@render fieldError(`err-bez-${block.clientKey}`, itemError(block.clientKey, 'bezeichnung'))}
		</div>

		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<Label>Betrag <span class="text-primary-text" aria-hidden="true">*</span></Label>
				<AmountField
					name="_betrag_{block.clientKey}"
					value={centsToInput(block.betragCents)}
					sign="minus"
					type="ausgabe"
					aria-invalid={Boolean(itemError(block.clientKey, 'betrag_cents'))}
					onchange={(c) => {
						block.betragCents = c;
						triggerSave();
					}}
				/>
				<p class="text-xs leading-snug text-ink-500">
					Wird als <b class="font-semibold">Auslage</b> erfasst — der Verein erstattet dir den Betrag.
				</p>
				{@render fieldError(`err-betrag-${block.clientKey}`, itemError(block.clientKey, 'betrag_cents'))}
			</div>
			<div class="flex flex-col gap-1.5">
				<Label>Rechnungsdatum <span class="text-primary-text" aria-hidden="true">*</span></Label>
				<DateField
					name="_datum_{block.clientKey}"
					value={block.rechnungsdatum}
					max={todayIso}
					aria-invalid={Boolean(itemError(block.clientKey, 'rechnungsdatum'))}
					onchange={(iso) => {
						block.rechnungsdatum = iso;
						triggerSave();
					}}
				/>
				{@render fieldError(`err-datum-${block.clientKey}`, itemError(block.clientKey, 'rechnungsdatum'))}
			</div>
		</div>

		{#if projects.length > 0}
			<div class="flex flex-col gap-1.5">
				<Label for="proj-{block.clientKey}">Projekt / Event <span class="font-normal text-ink-300">optional</span></Label>
				<select
					id="proj-{block.clientKey}"
					class="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:text-sm"
					bind:value={block.wofuer}
					onchange={triggerSave}
				>
					<option value="">🌥 Allgemein / kein konkretes Projekt</option>
					{#each projects as p (p.id)}
						<option value={p.name}>{p.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		<div class="flex flex-col gap-1.5">
			<Label for="kom-{block.clientKey}">Kommentar <span class="font-normal text-ink-300">optional</span></Label>
			<textarea
				id="kom-{block.clientKey}"
				rows={2}
				maxlength={1000}
				placeholder="Noch was, das Julia wissen sollte?"
				class="w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:text-sm"
				bind:value={block.kommentar}
				oninput={triggerSave}
			></textarea>
		</div>

		<BelegUpload
			bind:file={block.file}
			errors={itemError(block.clientKey, 'beleg') ? { beleg: [itemError(block.clientKey, 'beleg')!] } : {}}
			aria-invalid={Boolean(itemError(block.clientKey, 'beleg'))}
			onchange={triggerSave}
			onfile={(f) => {
				block.file = f;
				triggerSave();
			}}
		/>
	</div>
{/snippet}

<form
	{action}
	method="post"
	enctype="multipart/form-data"
	class="flex flex-col gap-6 pb-40"
	use:enhance={({ formData, cancel }) => {
		const decision = submit();
		if ('cancelled' in decision) {
			cancel();
			return;
		}
		// Rebuild the multipart body under our control: one JSON `data` field +
		// one `beleg_<i>` per block (index = position in the auslagen array).
		for (const k of [...formData.keys()]) formData.delete(k);
		formData.set('data', buildData());
		blocks.forEach((b, i) => {
			if (b.file) formData.set(`beleg_${i}`, b.file);
		});
		submitting = true;
		return async ({ update }) => {
			submitting = false;
			await update({ reset: false });
		};
	}}
>
	{#if draftRestored}
		<Callout
			tone="info"
			title="Entwurf wiederhergestellt."
			subtitle="Wir haben deine letzten Eingaben gesichert."
		>
			{#snippet icon()}<Info />{/snippet}
			{#snippet actions()}
				<button type="button" onclick={discardDraft} class="text-xs font-semibold text-ink-500 underline">Verwerfen</button>
			{/snippet}
		</Callout>
	{/if}

	{#if offlineError}
		<Callout tone="warn" title="Keine Internetverbindung." subtitle="Dein Entwurf ist gespeichert. Sobald du wieder online bist, kannst du absenden.">
			{#snippet icon()}<CircleAlert />{/snippet}
		</Callout>
	{/if}

	{#if serverError}
		<Callout tone="crit" title="Senden hat gerade nicht geklappt." subtitle={serverError} data-testid="einreichen-server-error">
			{#snippet icon()}<CircleAlert />{/snippet}
		</Callout>
	{/if}
	{#if attempted && formErrors && formErrors.length > 0}
		<Callout tone="crit" title="Bitte korrigiere die markierten Felder." subtitle={formErrors.join(' ')}>
			{#snippet icon()}<CircleAlert />{/snippet}
		</Callout>
	{/if}

	<LoginNudge />

	<!-- ── Section 1: Wer bekommt's zurück? (extern-only) ─────────────────────── -->
	<section class="flex flex-col gap-4">
		<h2 class="flex items-center gap-2 border-b border-hairline pb-2 text-[13px] font-extrabold text-ink-900">
			<span class="grid size-[22px] place-items-center rounded-full bg-secondary text-[11.5px] font-bold text-ink-700">1</span>
			Wer bekommt's zurück?
			{#if blocks.length > 1}<span class="ml-auto text-[11px] font-semibold text-ink-500">einmal für alle</span>{/if}
		</h2>
		<div class="flex flex-col gap-1.5">
			<Label for="ext-name">Name <span class="text-primary-text" aria-hidden="true">*</span></Label>
			<Input id="ext-name" type="text" maxlength={120} placeholder="Vor- und Nachname" bind:value={externName} oninput={triggerSave} aria-invalid={Boolean(identityError('name'))} />
			{@render fieldError('err-name', identityError('name'))}
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="ext-email">E-Mail <span class="text-primary-text" aria-hidden="true">*</span></Label>
			<Input id="ext-email" type="email" inputmode="email" autocapitalize="none" maxlength={254} placeholder="damit wir dich erreichen" bind:value={externEmail} oninput={triggerSave} aria-invalid={Boolean(identityError('email'))} />
			{@render fieldError('err-email', identityError('email'))}
		</div>
		<div class="flex flex-col gap-1.5">
			<Label for="ext-iban">IBAN <span class="text-primary-text" aria-hidden="true">*</span></Label>
			<Input id="ext-iban" type="text" class="tabular-nums tracking-[0.04em]" maxlength={34} placeholder="DE00 0000 0000 0000 0000 00" bind:value={externIban} oninput={triggerSave} aria-invalid={Boolean(identityError('iban'))} />
			<p class="text-xs leading-snug text-ink-500">Für die Rücküberweisung — geht <b class="font-semibold">verschlüsselt</b> direkt an den Vorstand.</p>
			{@render fieldError('err-iban', identityError('iban'))}
		</div>
	</section>

	<!-- ── Section 2: Auslagen ────────────────────────────────────────────────── -->
	<section class="flex flex-col gap-4">
		<h2 class="flex items-center gap-2 border-b border-hairline pb-2 text-[13px] font-extrabold text-ink-900">
			<span class="grid size-[22px] place-items-center rounded-full bg-secondary text-[11.5px] font-bold text-ink-700">2</span>
			{blocks.length > 1 ? 'Deine Auslagen' : "Wofür war's?"}
		</h2>

		<div class="flex flex-col gap-2.5" data-testid="auslage-repeater">
			{#if blocks.length === 1}
				{@render blockFields(blocks[0]!)}
			{:else}
				{#each blocks as block, i (block.clientKey)}
					<AuslageBlock
						index={i + 1}
						open={block.open}
						valid={blockComplete(block)}
						removable={blocks.length > 1}
						summary={blockComplete(block)
							? {
									title: block.bezeichnung,
									amountLabel: formatMoney(block.betragCents ?? 0),
									belegOk: block.file != null,
									dateLabel: block.rechnungsdatum
										? new Date(block.rechnungsdatum).toLocaleDateString('de-DE')
										: null
								}
							: null}
						onToggle={() => toggleBlock(block.clientKey)}
						onRemove={() => removeBlock(block.clientKey)}
					>
						{#snippet body()}{@render blockFields(block, i)}{/snippet}
					</AuslageBlock>
				{/each}
			{/if}

			{#if canAddMore}
				<button
					type="button"
					onclick={addBlock}
					data-testid="add-auslage"
					class="flex items-center justify-center gap-2 rounded-[12px] border border-dashed border-border py-3 text-sm font-semibold text-ink-700 transition-colors hover:border-primary/50 hover:text-primary-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4"
				>
					<Plus aria-hidden="true" />Weitere Auslage hinzufügen
				</button>
			{/if}
		</div>
	</section>

	<!-- ── Section 3: Datenschutz ─────────────────────────────────────────────── -->
	<section class="flex flex-col gap-3">
		<label class="flex cursor-pointer items-start gap-3">
			<input type="checkbox" bind:checked={consent} onchange={triggerSave} class="mt-0.5 size-4 shrink-0 accent-primary" aria-invalid={attempted && !consent} />
			<span class="text-sm text-ink-700">
				Ich bin einverstanden, dass meine Angaben zur Bearbeitung der Erstattung gespeichert werden.
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href="/datenschutz" target="_blank" rel="noopener noreferrer" class="font-semibold text-primary-text underline">Datenschutz</a>.
				<span aria-hidden="true"> *</span>
			</span>
		</label>
		<details class="text-xs text-ink-500">
			<summary class="cursor-pointer font-medium">Datenschutzhinweis anzeigen</summary>
			<p class="mt-2 whitespace-pre-line leading-relaxed">{datenschutzText(page.data.kontaktEmail ?? '')}</p>
		</details>
	</section>

	<!-- ── Review list (≥2 blocks) ────────────────────────────────────────────── -->
	{#if blocks.length > 1}
		<BatchReviewList
			items={blocks.map((b) => ({
				clientKey: b.clientKey,
				title: b.bezeichnung,
				dateLabel: b.rechnungsdatum ? new Date(b.rechnungsdatum).toLocaleDateString('de-DE') : null,
				betragCents: b.betragCents,
				belegOk: b.file != null,
				incomplete: !blockValid(b)
			}))}
			{gesamtCents}
			onEdit={editBlock}
			onRemove={removeBlock}
		/>
	{/if}

	<!-- ── Sticky foot ────────────────────────────────────────────────────────── -->
	<div class="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
		<div class="mx-auto flex max-w-xl flex-col gap-2">
			{#if !formValid && missingHint}
				<p class="flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-severity-critical-text [&_svg]:size-4" data-testid="einreichen-gate">
					<CircleAlert aria-hidden="true" />{missingHint}
				</p>
			{/if}
			<Button type="submit" size="lg" class="min-h-[52px] w-full text-[15px]" disabled={!formValid || submitting} aria-busy={submitting} data-testid="auslage-submit">
				{#if submitting}
					<svg class="mr-2 size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
						<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
					</svg>
					Wird eingereicht…
				{:else}
					<Send aria-hidden="true" class="mr-1.5 size-4" />{ctaLabel}
				{/if}
			</Button>
			<p class="flex items-center justify-center gap-1.5 text-[11.5px] text-ink-500 [&_svg]:size-3.5 [&_svg]:text-type-einnahme">
				<ShieldCheck aria-hidden="true" />Verschlüsselt · deine Daten gehen direkt an den Vorstand.
			</p>
		</div>
	</div>
</form>

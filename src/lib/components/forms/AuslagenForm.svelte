<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import BezahltVonPicker from './BezahltVonPicker.svelte';
	import BelegUpload from './BelegUpload.svelte';
	import { DATENSCHUTZ_TEXT, DATENSCHUTZ_VERSION } from '$lib/domain/datenschutz.js';
	import { makeDebouncedSave, loadDraft, clearDraft, type DraftMetadata } from '$lib/client/drafts.js';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	interface Member {
		id: string;
		display_name: string;
		email?: string;
	}

	interface Project {
		id: string;
		name: string;
	}

	interface Props {
		/** Action URL — defaults to the current page (SvelteKit default). */
		action?: string;
		members?: Member[];
		projects?: Project[];
		/** If set, show server-side error after a failed submission. */
		serverError?: string | null;
	}

	let { action = '?/default', members = [], projects = [], serverError = null }: Props = $props();

	// ---------------------------------------------------------------------------
	// Form state
	// ---------------------------------------------------------------------------

	let bezahltVonKind = $state<'verein' | 'member' | 'extern'>('verein');
	let memberId = $state('');
	let memberDisplayName = $state('');
	let memberEmail = $state('');
	let externName = $state('');
	let externIban = $state('');
	let externEmail = $state('');

	let bezeichnung = $state('');
	let betrag = $state('');
	let rechnungsdatum = $state(new Date().toISOString().split('T')[0]!);
	let wofuer = $state('');
	let kommentar = $state('');

	let belegFile = $state<File | null>(null);
	let datenschutzConsent = $state(false);

	// Validation errors (shown after blur)
	let fieldErrors = $state<Record<string, string[]>>({});
	let blurred = $state<Record<string, boolean>>({});

	// UI state
	let isSubmitting = $state(false);
	let draftRestored = $state(false);
	let hasUnsavedChanges = $state(false);

	// ---------------------------------------------------------------------------
	// Draft persistence
	// ---------------------------------------------------------------------------

	const debouncedSave = makeDebouncedSave(1000);

	function getDraftMetadata(): Omit<DraftMetadata, 'savedAt'> {
		return {
			bezahltVonKind,
			memberId,
			memberDisplayName,
			memberEmail,
			externName,
			externIban,
			externEmail,
			bezeichnung,
			betrag,
			rechnungsdatum,
			wofuer,
			kommentar
		};
	}

	function triggerDraftSave() {
		hasUnsavedChanges = true;
		if (browser) {
			debouncedSave(getDraftMetadata(), belegFile);
		}
	}

	function applyDraft(draft: { metadata: DraftMetadata; file: File | null }) {
		const m = draft.metadata;
		bezahltVonKind = m.bezahltVonKind;
		memberId = m.memberId ?? '';
		memberDisplayName = m.memberDisplayName ?? '';
		memberEmail = m.memberEmail ?? '';
		externName = m.externName ?? '';
		externIban = m.externIban ?? '';
		externEmail = m.externEmail ?? '';
		bezeichnung = m.bezeichnung;
		betrag = m.betrag;
		rechnungsdatum = m.rechnungsdatum;
		wofuer = m.wofuer;
		kommentar = m.kommentar;
		belegFile = draft.file;
		draftRestored = true;
	}

	onMount(() => {
		if (!browser) return;

		// Load draft asynchronously (best-effort, non-blocking)
		loadDraft().then((draft) => {
			if (draft) applyDraft(draft);
		});

		// Warn on navigation away with unsaved changes
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (hasUnsavedChanges && !isSubmitting) {
				e.preventDefault();
			}
		};
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	// ---------------------------------------------------------------------------
	// Betrag formatting
	// ---------------------------------------------------------------------------

	function parseBetragCents(raw: string): number | null {
		const cleaned = raw.replace(/[^\d,.]/, '').replace(',', '.');
		const parsed = parseFloat(cleaned);
		if (isNaN(parsed) || parsed <= 0) return null;
		return Math.round(parsed * 100);
	}

	// ---------------------------------------------------------------------------
	// Client-side validation
	// ---------------------------------------------------------------------------

	function validate(): boolean {
		const errs: Record<string, string[]> = {};

		if (bezahltVonKind === 'member' && !memberId) {
			errs['bezahlt_von.member_id'] = ['Bitte ein Vereinsmitglied auswählen.'];
		}
		if (bezahltVonKind === 'extern') {
			if (!externName.trim()) errs['bezahlt_von.name'] = ['Name ist erforderlich.'];
			if (!externIban.trim()) errs['bezahlt_von.iban'] = ['IBAN ist erforderlich.'];
			if (!externEmail.trim()) errs['bezahlt_von.email'] = ['E-Mail ist erforderlich.'];
		}
		if (!bezeichnung.trim() || bezeichnung.trim().length < 3) {
			errs['bezeichnung'] = ['Bitte mindestens 3 Zeichen eingeben.'];
		}
		const cents = parseBetragCents(betrag);
		if (!cents || cents <= 0) {
			errs['betragCents'] = ['Bitte einen gültigen Betrag eingeben (z.B. 12,50).'];
		}
		if (!datenschutzConsent) {
			errs['consent'] = ['Bitte Datenschutzhinweis bestätigen.'];
		}

		fieldErrors = errs;
		return Object.keys(errs).length === 0;
	}

	function getError(field: string): string | undefined {
		return blurred[field] ? fieldErrors[field]?.[0] : undefined;
	}

	function markBlurred(field: string) {
		blurred[field] = true;
		validate();
	}

	// ---------------------------------------------------------------------------
	// Build the JSON payload (the action expects `data` as JSON string)
	// ---------------------------------------------------------------------------

	function buildPayload(): string {
		const bv =
			bezahltVonKind === 'verein'
				? { kind: 'verein' as const }
				: bezahltVonKind === 'member'
					? {
							kind: 'member' as const,
							member_id: memberId,
							display_name: memberDisplayName,
							email: memberEmail || undefined
						}
					: {
							kind: 'extern' as const,
							name: externName,
							iban: externIban,
							email: externEmail
						};

		return JSON.stringify({
			bezahlt_von: bv,
			bezeichnung: bezeichnung.trim(),
			betragCents: parseBetragCents(betrag) ?? 0,
			currency: 'EUR',
			rechnungsdatum: rechnungsdatum || null,
			wofuer: wofuer || null,
			kommentar: kommentar || undefined,
			consent_text_version: DATENSCHUTZ_VERSION
		});
	}

	// ---------------------------------------------------------------------------
	// Submit handler (JS-enhanced path)
	// ---------------------------------------------------------------------------

	async function handleSubmit(e: SubmitEvent) {
		// Mark all fields as blurred to show all validation errors
		blurred = {
			'bezahlt_von.member_id': true,
			'bezahlt_von.name': true,
			'bezahlt_von.iban': true,
			'bezahlt_von.email': true,
			bezeichnung: true,
			betragCents: true,
			rechnungsdatum: true,
			consent: true
		};

		if (!validate()) {
			e.preventDefault();
			// Scroll to first error
			const firstError = document.querySelector('[aria-invalid="true"]');
			firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}

		isSubmitting = true;
		// Let the native form submit proceed (no JS fetch — SSR fallback works)
		// The hidden `data` field is set by the form's hidden input below.
		// We update it right before submit via the hidden input binding.
	}

	// Reactive payload for the hidden input
	let payloadJson = $derived(
		browser
			? buildPayload()
			: JSON.stringify({
					bezahlt_von: { kind: 'verein' },
					bezeichnung: '',
					betragCents: 0,
					currency: 'EUR'
				})
	);
</script>

<form
	{action}
	method="post"
	enctype="multipart/form-data"
	class="flex flex-col gap-6 pb-32"
	onsubmit={handleSubmit}
	novalidate
>
	<!-- Hidden JSON payload field -->
	<input type="hidden" name="data" value={payloadJson} />

	<!-- Draft restored banner -->
	{#if draftRestored}
		<div
			class="bg-muted flex items-center justify-between rounded-lg px-4 py-3 text-sm"
			role="status"
		>
			<span>Entwurf wiederhergestellt.</span>
			<button
				type="button"
				class="text-muted-foreground ml-4 underline"
				onclick={() => {
					draftRestored = false;
					clearDraft();
				}}
			>
				Verwerfen
			</button>
		</div>
	{/if}

	<!-- Server error -->
	{#if serverError}
		<div class="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm" role="alert">
			{serverError}
		</div>
	{/if}

	<!-- ── Section 1: Wer hat bezahlt? ──────────────────────────────────────── -->
	<BezahltVonPicker
		bind:kind={bezahltVonKind}
		{members}
		bind:memberId
		bind:memberDisplayName
		bind:memberEmail
		bind:externName
		bind:externIban
		bind:externEmail
		errors={fieldErrors}
		onchange={triggerDraftSave}
	/>

	<!-- ── Section 2: Wofür ist die Auslage? ──────────────────────────────── -->
	<Card>
		<CardHeader>
			<CardTitle>Wofür ist die Auslage?</CardTitle>
		</CardHeader>
		<CardContent class="flex flex-col gap-4">
			<!-- Projekt (stub until Phase 3) -->
			{#if projects.length > 0}
				<div class="flex flex-col gap-1.5">
					<Label for="wofuer-select">Projekt / Event</Label>
					<p class="text-muted-foreground text-xs">
						Bei einem konkreten Event das Event wählen. Bei allgemeinen Vereinsausgaben → Allgemein.
					</p>
					<select
						id="wofuer-select"
						name="wofuer_select"
						class="border-input bg-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
						onchange={(e) => {
							wofuer = e.currentTarget.value;
							triggerDraftSave();
						}}
					>
						<option value="">🌥 Allgemein / kein konkretes Projekt</option>
						{#each projects as p (p.id)}
							<option value={p.name} selected={wofuer === p.name}>{p.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<!-- Bezeichnung -->
			<div class="flex flex-col gap-1.5">
				<Label for="bezeichnung">Was war's? <span aria-hidden="true">*</span></Label>
				<p class="text-muted-foreground text-xs">
					Kurze Beschreibung — z.B. „Bahnticket München → Berlin" oder „Deko-Material Sommerfest".
				</p>
				<Input
					id="bezeichnung"
					name="bezeichnung_display"
					type="text"
					maxlength={200}
					placeholder="Bahnticket München → Berlin"
					bind:value={bezeichnung}
					oninput={triggerDraftSave}
					onblur={() => markBlurred('bezeichnung')}
					aria-invalid={!!getError('bezeichnung')}
				/>
				<div class="flex justify-between">
					{#if getError('bezeichnung')}
						<p class="text-destructive text-xs">{getError('bezeichnung')}</p>
					{:else}
						<span></span>
					{/if}
					<p class="text-muted-foreground text-xs">{bezeichnung.length}/200</p>
				</div>
			</div>

			<!-- Betrag -->
			<div class="flex flex-col gap-1.5">
				<Label for="betrag">Betrag in Euro <span aria-hidden="true">*</span></Label>
				<p class="text-muted-foreground text-xs">
					Bruttobetrag (inkl. MwSt.) — was du tatsächlich gezahlt hast.
				</p>
				<div class="relative">
					<span
						class="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm select-none"
						aria-hidden="true">€</span
					>
					<Input
						id="betrag"
						name="betrag_display"
						type="text"
						inputmode="decimal"
						placeholder="12,50"
						class="pl-7"
						bind:value={betrag}
						oninput={triggerDraftSave}
						onblur={() => markBlurred('betragCents')}
						aria-invalid={!!getError('betragCents')}
					/>
				</div>
				{#if getError('betragCents')}
					<p class="text-destructive text-xs">{getError('betragCents')}</p>
				{/if}
			</div>

			<!-- Rechnungsdatum -->
			<div class="flex flex-col gap-1.5">
				<Label for="rechnungsdatum">Rechnungsdatum</Label>
				<p class="text-muted-foreground text-xs">Datum vom Beleg.</p>
				<Input
					id="rechnungsdatum"
					name="rechnungsdatum_display"
					type="date"
					bind:value={rechnungsdatum}
					oninput={triggerDraftSave}
					onblur={() => markBlurred('rechnungsdatum')}
				/>
			</div>

			<!-- Kommentar -->
			<div class="flex flex-col gap-1.5">
				<Label for="kommentar">Kommentar <span class="text-muted-foreground font-normal">(optional)</span></Label>
				<p class="text-muted-foreground text-xs">
					Falls Kontext fehlt — z.B. „Anlass: Wochenende 18.–20.10." oder „Ersatzteil für Nebelmaschine".
				</p>
				<textarea
					id="kommentar"
					name="kommentar_display"
					rows={3}
					maxlength={1000}
					placeholder="Optionaler Kommentar…"
					class="border-input bg-background focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					bind:value={kommentar}
					oninput={triggerDraftSave}
				></textarea>
				<p class="text-muted-foreground text-right text-xs">{kommentar.length}/1000</p>
			</div>
		</CardContent>
	</Card>

	<!-- ── Section 3: Beleg ──────────────────────────────────────────────────── -->
	<BelegUpload
		bind:file={belegFile}
		errors={fieldErrors}
		onchange={triggerDraftSave}
		onfile={(f) => {
			belegFile = f;
		}}
	/>

	<!-- ── Section 4: Datenschutz ───────────────────────────────────────────── -->
	<Card>
		<CardHeader>
			<CardTitle>Datenschutz</CardTitle>
		</CardHeader>
		<CardContent class="flex flex-col gap-4">
			<p class="text-muted-foreground whitespace-pre-line text-sm leading-relaxed">
				{DATENSCHUTZ_TEXT}
			</p>

			<label class="flex cursor-pointer items-start gap-3">
				<input
					type="checkbox"
					name="datenschutz_consent"
					value={DATENSCHUTZ_VERSION}
					bind:checked={datenschutzConsent}
					onchange={() => {
						markBlurred('consent');
						triggerDraftSave();
					}}
					class="accent-primary mt-0.5 h-4 w-4 shrink-0"
					aria-invalid={!!getError('consent')}
				/>
				<span class="text-sm">
					Ich habe den Datenschutzhinweis gelesen und stimme der Verarbeitung meiner Daten zu.
					<span aria-hidden="true"> *</span>
				</span>
			</label>

			<!-- Hidden version stamp for server -->
			<input type="hidden" name="consent_text_version" value={DATENSCHUTZ_VERSION} />

			{#if getError('consent')}
				<p class="text-destructive text-xs">{getError('consent')}</p>
			{/if}
		</CardContent>
	</Card>

	<!-- ── Sticky CTA ──────────────────────────────────────────────────────── -->
	<div
		class="bg-background/95 fixed right-0 bottom-0 left-0 z-50 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
	>
		<div class="mx-auto max-w-xl">
			{#if Object.keys(fieldErrors).length > 0 && Object.keys(blurred).length > 0}
				<p class="text-destructive mb-2 text-center text-xs">
					Bitte alle Pflichtfelder ausfüllen.
				</p>
			{/if}
			<Button
				type="submit"
				class="w-full"
				size="lg"
				disabled={isSubmitting}
				aria-busy={isSubmitting}
			>
				{#if isSubmitting}
					<svg
						class="mr-2 h-4 w-4 animate-spin"
						fill="none"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
						></path>
					</svg>
					Wird eingereicht…
				{:else}
					Auslage einreichen
				{/if}
			</Button>
		</div>
	</div>
</form>

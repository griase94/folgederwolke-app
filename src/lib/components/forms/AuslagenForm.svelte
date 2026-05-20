<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import BezahltVonPicker from './BezahltVonPicker.svelte';
	import BelegUpload from './BelegUpload.svelte';
	import { DATENSCHUTZ_TEXT, DATENSCHUTZ_VERSION } from '$lib/domain/datenschutz.js';
	import { makeDebouncedSave, loadDraft, clearDraft, type DraftMetadata } from '$lib/client/drafts.js';
	import { parseBetragCents } from '$lib/client/parse-betrag.js';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';

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
		/**
		 * Per-field validation errors returned by the server action (e.g. Zod
		 * issues). Merged into local `fieldErrors` state on mount/update so the
		 * errors render immediately under each field. Field keys match the
		 * client-side ones (`bezeichnung`, `betragCents`, `bezahlt_von.iban`,
		 * `consent`, …).
		 */
		serverFieldErrors?: Record<string, string[]> | null;
		/**
		 * Optional initial values for the form. Used by the PWA share_target
		 * (M2) redirect bridge so the form opens pre-populated with the
		 * bezeichnung/kommentar the user shared. Falsy values are ignored —
		 * the form keeps its empty default. Draft restore wins over these:
		 * if a draft exists the user gets their in-progress work back.
		 */
		initialBezeichnung?: string;
		initialKommentar?: string;
	}

	let {
		// '' = post to the route's base URL → SvelteKit's default action.
		// Was '?/default' which SvelteKit explicitly rejects as a reserved
		// action name when the only registered action IS `default`. Caught
		// by the 2026-05-19 Auslagen-tester agent as AT-001 (P0).
		action = '',
		members = [],
		projects = [],
		serverError = null,
		serverFieldErrors = null,
		initialBezeichnung = '',
		initialKommentar = ''
	}: Props = $props();

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

	let bezeichnung = $state(initialBezeichnung);
	let betrag = $state('');
	let rechnungsdatum = $state(new Date().toISOString().split('T')[0]!);
	let wofuer = $state('');
	let kommentar = $state(initialKommentar);

	let belegFile = $state<File | null>(null);
	let datenschutzConsent = $state(false);

	// Validation errors (shown after blur)
	let fieldErrors = $state<Record<string, string[]>>({});
	let blurred = $state<Record<string, boolean>>({});

	// Merge server-side per-field errors into local validation state whenever
	// the action returns a new `form?.errors` payload. Marking the field as
	// blurred forces the error to render immediately (matching the visible-
	// after-touch UX rule for client-only errors).
	$effect(() => {
		const incoming = serverFieldErrors;
		if (!incoming) return;
		const merged: Record<string, string[]> = { ...fieldErrors };
		const blurredNext: Record<string, boolean> = { ...blurred };
		for (const [field, msgs] of Object.entries(incoming)) {
			if (Array.isArray(msgs) && msgs.length > 0) {
				merged[field] = msgs;
				blurredNext[field] = true;
			}
		}
		fieldErrors = merged;
		blurred = blurredNext;
	});

	// UI state
	let isSubmitting = $state(false);
	let draftRestored = $state(false);
	let hasUnsavedChanges = $state(false);
	let ctaBottomOffset = $state(0);

	// Idempotency key: generated once per page load
	const submissionNonce = crypto.randomUUID();

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

		// Warn on native browser navigation away with unsaved changes
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			if (hasUnsavedChanges && !isSubmitting) {
				e.preventDefault();
			}
		};
		window.addEventListener('beforeunload', handleBeforeUnload);

		// VisualViewport-aware sticky CTA: keep CTA visible when virtual keyboard opens
		if (window.visualViewport) {
			const vv = window.visualViewport;
			const update = () => {
				ctaBottomOffset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
			};
			vv.addEventListener('resize', update);
			vv.addEventListener('scroll', update);
			update();
			return () => {
				window.removeEventListener('beforeunload', handleBeforeUnload);
				vv.removeEventListener('resize', update);
				vv.removeEventListener('scroll', update);
			};
		}

		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	// SvelteKit navigation guard (C2)
	beforeNavigate(({ cancel }) => {
		if (hasUnsavedChanges && !isSubmitting) {
			const ok = confirm('Du hast ungespeicherte Änderungen. Wirklich verlassen?');
			if (!ok) cancel();
		}
	});

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
			betragCents: parseBetragCents(betrag) || 0,
			currency: 'EUR',
			rechnungsdatum: rechnungsdatum || null,
			wofuer: wofuer || null,
			kommentar: kommentar || undefined,
			consent_text_version: DATENSCHUTZ_VERSION,
			submissionNonce
		});
	}

	// ---------------------------------------------------------------------------
	// Submit handler (JS-enhanced path)
	// ---------------------------------------------------------------------------

	async function handleSubmit(e: SubmitEvent) {
		// C6: Double-submit guard — must be synchronous and first
		if (isSubmitting) {
			e.preventDefault();
			return;
		}
		isSubmitting = true;

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
			isSubmitting = false;
			e.preventDefault();
			// Scroll to first error
			const firstError = document.querySelector('[aria-invalid="true"]');
			firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}

		// C9: Clear unsaved changes flag before submit to prevent beforeunload/beforeNavigate
		// from firing during the 303 redirect. Actual clearDraft happens on the success page (C1).
		hasUnsavedChanges = false;

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
	<!-- Idempotency key (C8) -->
	<input type="hidden" name="submissionNonce" value={submissionNonce} />

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
						class="border-input bg-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-base md:text-sm focus-visible:ring-2 focus-visible:outline-none"
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
					aria-describedby={getError('bezeichnung') ? 'err-bezeichnung' : undefined}
				/>
				<div class="flex justify-between">
					{#if getError('bezeichnung')}
						<p id="err-bezeichnung" class="text-destructive text-xs">{getError('bezeichnung')}</p>
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
						aria-describedby={getError('betragCents') ? 'err-betragCents' : undefined}
					/>
				</div>
				{#if getError('betragCents')}
					<p id="err-betragCents" class="text-destructive text-xs">{getError('betragCents')}</p>
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
					lang="de"
					max={new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })}
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
					class="border-input bg-background focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-base md:text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
					aria-describedby={getError('consent') ? 'err-consent' : undefined}
				/>
				<span class="text-sm">
					Ich habe den Datenschutzhinweis gelesen und stimme der Verarbeitung meiner Daten zu.
					<span aria-hidden="true"> *</span>
				</span>
			</label>

			<!-- Link to full privacy policy (C12) -->
			<!-- Note: /datenschutz is Phase 7.5 — link will 404 until that route is deployed -->
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
			<a href="/datenschutz" target="_blank" rel="noopener noreferrer" class="underline text-primary text-sm">Vollständige Datenschutzerklärung</a>

			<!-- Hidden version stamp for server -->
			<input type="hidden" name="consent_text_version" value={DATENSCHUTZ_VERSION} />

			{#if getError('consent')}
				<p id="err-consent" class="text-destructive text-xs">{getError('consent')}</p>
			{/if}
		</CardContent>
	</Card>

	<!-- ── Sticky CTA ──────────────────────────────────────────────────────── -->
	<!-- C3: ctaBottomOffset shifts the bar up when virtual keyboard opens on mobile -->
	<div
		class="bg-background/95 fixed right-0 bottom-0 left-0 z-50 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
		style="bottom: {ctaBottomOffset}px;"
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

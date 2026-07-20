<script lang="ts">
	/**
	 * AusgabeFields — Aurora B2 (entry-modal-v4).
	 *
	 * Two sections per the plate: Buchung / Zuordnung.
	 *   Buchung  : Betrag-Hero + Rechnungsdatum-Hero (identical anatomy, ANDY-LENS
	 *              §2) + type-caption, Abfluss-Datum, Bezeichnung, Kategorie →
	 *              LockedSphereField (derived, read-only), Beleg-oder-Verzicht gate.
	 *   Zuordnung: Projekt, Bezahlt-von (ADR-0007 union) + „Schon bezahlt?" reveal.
	 *
	 * Betrag is the shared hero AmountField (emits integer cents via name=betragCents,
	 * ADR-0003). The Sphäre is derived STRICTLY from the Kategorie (ADR-0002) and shown
	 * read-only — never a chooser, no project override in the entry path.
	 *
	 * PRESERVE the bind:value local-state pattern (EinnahmeFields bind-regression
	 * lesson): every editable field is local $state seeded once from `values`.
	 */
	import { AmountField, DateField as HeroDateField } from '$lib/components/ui/hero-field/index.js';
	import CompactDateField from '$lib/components/ui/date-field/DateField.svelte';
	import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import LockedSphereField from '$lib/components/admin/transactions/fields/LockedSphereField.svelte';
	import BelegUpload from '$lib/components/admin/transactions/fields/BelegUpload.svelte';
	import { FIELD_CLASS } from '$lib/components/admin/transactions/fields/field-class.js';
	import { parseBetragCents } from '$lib/client/parse-betrag.js';
	import type { Sphere } from '$lib/domain/sphere.js';

	interface MemberRow {
		id: string;
		vorname: string;
		nachname: string;
		email: string | null;
		iban: string | null;
	}
	interface KategorieRow {
		id: string;
		name: string;
		sphere: Sphere;
	}
	interface ZahlungsartRow {
		id: string;
		label: string;
	}
	interface ProjectRow {
		id: string;
		name: string;
	}

	/**
	 * Form re-hydration shape (mirrors `AusgabeFormValues` in +page.server.ts).
	 * Seeds the form on BOTH the duplicate-as-template prefill (load) and a 422
	 * re-hydrate (?/create echoes the submitted values back) so input is never wiped.
	 */
	interface AusgabeValues {
		bezeichnung: string;
		betrag: string;
		kategorieNameSnapshot: string;
		kommentar: string;
		projectId: string;
		bezahltVonKind: 'verein' | 'member' | 'extern';
		bezahltVonMemberId: string;
		externName: string;
		externIban: string;
		externEmail: string;
		rechnungsdatum: string;
		abflussDatum: string;
		zahlungsartId: string;
		schonBezahlt: boolean;
		erstattetAm: string;
		keinBeleg: boolean;
		begruendung: string;
	}

	/** Advisory footer gate readout (entry-modal-v4 `.gate-line`). */
	interface GateStatus {
		ok: boolean;
		text: string;
	}

	interface Props {
		members: MemberRow[];
		expenseKategorien: KategorieRow[];
		zahlungsarten: ZahlungsartRow[];
		projects: ProjectRow[];
		/** Prefill / re-hydrate seed (load prefill OR a failed-submit echo). */
		values: AusgabeValues;
		/** Per-field validation errors from a 422 (keyed by field name). */
		errors?: Record<string, string[]>;
		/** Bubbled up so the page can track dirtiness for the shell footer. */
		onDirty?: () => void;
		/** Bubbled up so the shell footer can show the amber/green gate-line. */
		onGate?: (status: GateStatus) => void;
		/** White-label (Phase 1): runtime Verein name for the bezahlt-von snapshot. */
		vereinName?: string;
	}

	let {
		members,
		expenseKategorien,
		zahlungsarten,
		projects,
		values,
		errors,
		onDirty,
		onGate,
		vereinName = 'Verein',
	}: Props = $props();

	const today = new Date().toISOString().slice(0, 10);

	function err(field: string): string | null {
		return errors?.[field]?.[0] ?? null;
	}

	// A 422 re-hydrate carries an `errors` map; a fresh form (or prefill) does not.
	// Default dates to `today` only on a fresh form. Read once at init.
	// svelte-ignore state_referenced_locally
	const hadError = !!errors;

	// ── Descriptive fields (seeded from `values`) ─────────────────────────────
	// svelte-ignore state_referenced_locally
	let bezeichnung = $state(values.bezeichnung);
	// svelte-ignore state_referenced_locally
	let kommentar = $state(values.kommentar);
	// svelte-ignore state_referenced_locally
	let kategorieName = $state(values.kategorieNameSnapshot);
	// svelte-ignore state_referenced_locally
	let kategorieSphere = $state<Sphere>(
		expenseKategorien.find((k) => k.name === values.kategorieNameSnapshot)?.sphere ?? 'ideeller',
	);
	// svelte-ignore state_referenced_locally
	let rechnungsdatum = $state(values.rechnungsdatum || (hadError ? '' : today));
	// svelte-ignore state_referenced_locally
	let abflussDatum = $state(values.abflussDatum || (hadError ? '' : today));
	// svelte-ignore state_referenced_locally
	let projectId = $state(values.projectId);

	// Betrag → shared hero AmountField (emits cents via name=betragCents). Track the
	// parsed cents locally for the gate readout; seed from the prefill so a
	// duplicate-as-template doesn't read as "Fehlt Betrag".
	// svelte-ignore state_referenced_locally
	let betragCents = $state<number | null>(
		values.betrag ? (parseBetragCents(values.betrag) || null) : null,
	);

	// ── bezahlt-von branching ─────────────────────────────────────────────────
	// svelte-ignore state_referenced_locally
	let bezahltVonKind = $state<'verein' | 'member' | 'extern'>(values.bezahltVonKind);
	// svelte-ignore state_referenced_locally
	let selectedMemberId = $state(values.bezahltVonMemberId);
	// svelte-ignore state_referenced_locally
	let externName = $state(values.externName);
	// svelte-ignore state_referenced_locally
	let externIban = $state(values.externIban);
	// svelte-ignore state_referenced_locally
	let externEmail = $state(values.externEmail);

	const selectedMember = $derived(members.find((m) => m.id === selectedMemberId));
	const bezahltVonDisplay = $derived(() => {
		if (bezahltVonKind === 'verein') return vereinName;
		if (bezahltVonKind === 'member' && selectedMember) {
			return `${selectedMember.vorname} ${selectedMember.nachname}`.trim();
		}
		return '';
	});

	// ── Admin "Schon bezahlt?" reveal (member/extern only) ────────────────────
	// svelte-ignore state_referenced_locally
	let schonBezahlt = $state(values.schonBezahlt);
	// svelte-ignore state_referenced_locally
	let zahlungsartId = $state(values.zahlungsartId);
	// svelte-ignore state_referenced_locally
	let erstattetAm = $state(values.erstattetAm || today);

	// ── Beleg gate (segment: Beleg | Verzicht) ────────────────────────────────
	// svelte-ignore state_referenced_locally
	let keinBeleg = $state(values.keinBeleg);
	// svelte-ignore state_referenced_locally
	let begruendung = $state(values.begruendung);
	let hasBelegFile = $state(false);

	$effect(() => {
		if (!zahlungsartId && zahlungsarten.length > 0) {
			zahlungsartId = zahlungsarten[0]?.id ?? '';
		}
	});

	function markDirty() {
		onDirty?.();
	}

	// ── Gate readout (advisory only — server enforces; CTA gates on `dirty`) ───
	const belegOk = $derived(hasBelegFile || (keinBeleg && begruendung.trim().length >= 5));
	const missing = $derived.by(() => {
		const m: string[] = [];
		if (!betragCents || betragCents <= 0) m.push('Betrag');
		if (!rechnungsdatum) m.push('Datum');
		if (!bezeichnung.trim()) m.push('Bezeichnung');
		if (!kategorieName) m.push('Kategorie');
		if (!belegOk) m.push('Beleg');
		return m;
	});
	$effect(() => {
		onGate?.(
			missing.length
				? { ok: false, text: `Fehlt noch: ${missing.join(', ')}.` }
				: { ok: true, text: 'Alles da.' },
		);
	});
</script>

<div class="flex flex-col gap-4" oninput={markDirty} onchange={markDirty}>
	<!-- ── Section 1: Buchung ─────────────────────────────────────────────────── -->
	<section class="rounded-xl border border-hairline bg-card/60 p-4" data-slot="ausgabe-section">
		<h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Buchung</h3>
		<div class="flex flex-col gap-3">
			<!-- Betrag-Hero + Rechnungsdatum-Hero (identical anatomy) -->
			<div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<label for="betrag-display" class="text-sm font-medium text-ink-900">
							Betrag <span class="text-severity-critical" aria-hidden="true">*</span>
						</label>
						<AmountField
							id="betrag-display"
							name="betragCents"
							value={values.betrag}
							type="ausgabe"
							sign="minus"
							aria-invalid={err('betragCents') ? true : undefined}
							onchange={(c) => {
								betragCents = c;
								markDirty();
							}}
						/>
						{#if err('betragCents')}
							<p class="text-xs text-severity-critical">{err('betragCents')}</p>
						{/if}
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="rechnungsdatum" class="text-sm font-medium text-ink-900">
							Rechnungsdatum <span class="text-severity-critical" aria-hidden="true">*</span>
						</label>
						<HeroDateField
							id="rechnungsdatum"
							name="rechnungsdatum"
							value={rechnungsdatum}
							required
							aria-invalid={err('rechnungsdatum') ? true : undefined}
							onchange={(iso) => {
								rechnungsdatum = iso;
								markDirty();
							}}
						/>
						{#if err('rechnungsdatum')}
							<p class="text-xs text-severity-critical">{err('rechnungsdatum')}</p>
						{/if}
					</div>
				</div>
				<p class="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
					<span class="size-1.5 rounded-full bg-type-ausgabe" aria-hidden="true"></span>
					Wird als <b class="font-semibold text-ink-700">Ausgabe</b> mit Minus gebucht.
				</p>
			</div>

			<!-- Abfluss-Datum (payment date → Buchungsjahr) -->
			<div class="flex flex-col gap-1.5">
				<label for="abfluss_datum" class="text-sm font-medium text-ink-900">
					Abfluss-Datum <span class="text-severity-critical" aria-hidden="true">*</span>
				</label>
				<CompactDateField
					id="abfluss_datum"
					name="abfluss_datum"
					value={abflussDatum}
					required
					onchange={(iso) => {
						abflussDatum = iso;
						markDirty();
					}}
				/>
				{#if err('abfluss_datum')}
					<p class="text-xs text-severity-critical">{err('abfluss_datum')}</p>
				{/if}
			</div>

			<!-- Bezeichnung -->
			<div class="flex flex-col gap-1.5">
				<label for="bezeichnung" class="text-sm font-medium text-ink-900">
					Bezeichnung <span class="text-severity-critical" aria-hidden="true">*</span>
				</label>
				<input
					id="bezeichnung"
					name="bezeichnung"
					type="text"
					required
					maxlength={500}
					bind:value={bezeichnung}
					placeholder="z.B. Druckerpatronen, Raummiete März"
					aria-invalid={err('bezeichnung') ? true : undefined}
					class={FIELD_CLASS}
				/>
				{#if err('bezeichnung')}
					<p class="text-xs text-severity-critical">{err('bezeichnung')}</p>
				{/if}
			</div>

			<!-- Kategorie (drives Sphäre strictly; sphere shown in the locked field below) -->
			<div class="flex flex-col gap-1.5">
				<KategoriePicker
					id="kategorie"
					name="kategorieNameSnapshot"
					required
					hideSphere
					options={expenseKategorien}
					value={kategorieName}
					onChange={(name) => {
						kategorieName = name;
						markDirty();
					}}
					onSphere={(s) => (kategorieSphere = s)}
				/>
				<!-- Hidden sphere mirror — server re-derives, this is caller-parity only. -->
				<input type="hidden" name="sphereSnapshot" value={kategorieSphere} />
				{#if err('kategorieNameSnapshot')}
					<p class="text-xs text-severity-critical">{err('kategorieNameSnapshot')}</p>
				{/if}
			</div>

			<!-- Sphäre — read-only, derived from the Kategorie (ADR-0002) -->
			<LockedSphereField sphere={kategorieSphere} />

			<!-- Beleg-oder-Verzicht gate (Pflicht) -->
			<BelegUpload
				variant="segment"
				bind:keinBeleg
				bind:begruendung
				onHasFile={(v) => (hasBelegFile = v)}
				error={err('beleg') ?? undefined}
			/>
		</div>
	</section>

	<!-- ── Section 2: Zuordnung ───────────────────────────────────────────────── -->
	<section class="rounded-xl border border-hairline bg-card/60 p-4" data-slot="ausgabe-section">
		<h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Zuordnung</h3>
		<div class="flex flex-col gap-3">
			<!-- Projekt (optional) -->
			{#if projects.length > 0}
				<div class="flex flex-col gap-1.5">
					<label for="projectId" class="text-sm font-medium text-ink-900">Projekt</label>
					<select id="projectId" name="projectId" bind:value={projectId} class={FIELD_CLASS}>
						<option value="">— Kein Projekt —</option>
						{#each projects as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<!-- Bezahlt von (ADR-0007 union) — neutral segmented toggle (never brand pink) -->
			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium text-ink-900">Bezahlt von</span>
				<div
					class="flex gap-1 rounded-[10px] border border-hairline bg-secondary p-1"
					role="radiogroup"
					aria-label="Bezahlt von"
					data-slot="bezahlt-von-grid"
				>
					{#each [['verein', 'Verein'], ['member', 'Mitglied'], ['extern', 'Extern']] as [k, l] (k)}
						{@const on = bezahltVonKind === k}
						<button
							type="button"
							role="radio"
							aria-checked={on}
							onclick={() => {
								bezahltVonKind = k as 'verein' | 'member' | 'extern';
								markDirty();
							}}
							data-testid={`bezahlt-von-${k}`}
							data-state={on ? 'on' : 'off'}
							class={[
								'inline-flex min-h-10 flex-1 items-center justify-center rounded-[7px] px-3 py-2 text-sm font-medium transition-colors',
								on
									? 'bg-card text-ink-900 shadow-sm ring-1 ring-hairline'
									: 'bg-transparent text-ink-500 hover:text-ink-900',
							].join(' ')}
						>
							{l}
						</button>
					{/each}
				</div>
			</div>

			<input type="hidden" name="bezahltVonKind" value={bezahltVonKind} data-testid="bezahlt-von-kind" />
			<input type="hidden" name="bezahltVonDisplay" value={bezahltVonDisplay()} />

			<div>
				{#if bezahltVonKind === 'verein'}
					<div
						data-testid="verein-autopaid-note"
						class="rounded-[10px] border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-200"
					>
						Direkt vom Verein bezahlt — wird sofort als <strong>erstattet</strong> verbucht (Abfluss-Datum
						oben).
					</div>
				{:else if bezahltVonKind === 'member'}
					<select name="bezahltVonMemberId" bind:value={selectedMemberId} class={FIELD_CLASS}>
						<option value="">Mitglied auswählen…</option>
						{#each members as m (m.id)}
							<option value={m.id}>{m.nachname}, {m.vorname}</option>
						{/each}
					</select>
				{:else}
					<div class="flex flex-col gap-2">
						<input
							name="externName"
							type="text"
							placeholder="Name"
							bind:value={externName}
							data-testid="extern-name-input"
							class={FIELD_CLASS}
						/>
						<input
							name="externIban"
							type="text"
							placeholder="IBAN"
							bind:value={externIban}
							class="{FIELD_CLASS} font-mono"
						/>
						<input
							name="externEmail"
							type="email"
							placeholder="E-Mail (optional)"
							bind:value={externEmail}
							class={FIELD_CLASS}
						/>
					</div>
				{/if}
			</div>

			<!-- ── Admin "Schon bezahlt?" reveal (member/extern only) ─────────────── -->
			{#if bezahltVonKind !== 'verein'}
				<div class="rounded-[10px] border border-hairline bg-muted/30 px-3 py-2.5">
					<label class="flex items-center gap-2 text-sm font-medium text-ink-900">
						<input
							type="checkbox"
							name="schonBezahlt"
							value="true"
							bind:checked={schonBezahlt}
							onchange={markDirty}
							class="size-4 rounded border-hairline accent-primary"
							data-testid="schon-bezahlt-toggle"
						/>
						Schon bezahlt? (Erstattung sofort verbuchen + benachrichtigen)
					</label>

					{#if schonBezahlt}
						<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div class="flex flex-col gap-1.5">
								<label for="zahlungsartId" class="text-sm font-medium text-ink-900">
									Zahlungsart <span class="text-severity-critical" aria-hidden="true">*</span>
								</label>
								<select id="zahlungsartId" name="zahlungsartId" bind:value={zahlungsartId} class={FIELD_CLASS}>
									{#each zahlungsarten as z (z.id)}
										<option value={z.id}>{z.label}</option>
									{/each}
								</select>
							</div>
							<div class="flex flex-col gap-1.5">
								<label for="erstattetAm" class="text-sm font-medium text-ink-900">
									Erstattungsdatum <span class="text-severity-critical" aria-hidden="true">*</span>
								</label>
								<CompactDateField
									id="erstattetAm"
									name="erstattetAm"
									value={erstattetAm}
									onchange={(iso) => {
										erstattetAm = iso;
										markDirty();
									}}
								/>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<!-- Verein path: optional Zahlungsart picker. -->
				<div class="flex flex-col gap-1.5">
					<label for="zahlungsartId-verein" class="text-sm font-medium text-ink-900">Zahlungsart</label>
					<select id="zahlungsartId-verein" name="zahlungsartId" bind:value={zahlungsartId} class={FIELD_CLASS}>
						<option value="">— Keine —</option>
						{#each zahlungsarten as z (z.id)}
							<option value={z.id}>{z.label}</option>
						{/each}
					</select>
				</div>
			{/if}

			<!-- Kommentar (optional) -->
			<div class="flex flex-col gap-1.5">
				<label for="kommentar" class="text-sm font-medium text-ink-900">Kommentar</label>
				<textarea
					id="kommentar"
					name="kommentar"
					rows={2}
					maxlength={2000}
					bind:value={kommentar}
					class="w-full rounded-[10px] border border-hairline bg-card px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
				></textarea>
			</div>
		</div>
	</section>
</div>

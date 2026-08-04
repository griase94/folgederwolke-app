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
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { FieldGroup } from '$lib/components/ui/field-group/index.js';
	import CompactDateField from '$lib/components/ui/date-field/DateField.svelte';
	import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import LockedSphereField from '$lib/components/admin/transactions/fields/LockedSphereField.svelte';
	import BelegUpload from '$lib/components/forms/BelegUpload.svelte';
	import { FIELD_CLASS } from '$lib/components/ui/field-class/index.js';
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
		kategorieId: string;
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
	// #115: the picker submits the kategorie ID (createExpense resolves by id).
	// svelte-ignore state_referenced_locally
	let kategorieId = $state(values.kategorieId);
	// svelte-ignore state_referenced_locally
	let kategorieSphere = $state<Sphere>(
		expenseKategorien.find((k) => k.id === values.kategorieId)?.sphere ?? 'ideeller',
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
		// Extern MUST post the typed name — an empty hidden would map to null on
		// the server and (with the schema default firing only on `undefined`) fail
		// the parse with an invisible „Ungültige Eingabe" wall, gate still green,
		// so the extern-IBAN check downstream would never even run.
		if (bezahltVonKind === 'extern') return externName.trim();
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

	// Betrag error (m7): a client value of 0,00 (or ≤0) is client-VALID enough to
	// submit (the gate treats it as present) but flagged with a red frame + hint;
	// the server returns the authoritative de-DE 422. A server echo wins.
	const betragError = $derived(
		err('betragCents') ??
			(betragCents !== null && betragCents <= 0 ? 'Betrag muss größer als 0 sein.' : null),
	);

	// ── Gate readout: every required field present + valid (M4 + Wrinkle a). A
	// Betrag ≤ 0 counts as missing so the gate never reads „Alles da." next to a
	// red 0,00 field; the server-422 roundtrip is proven via a server-only rule
	// (extern-IBAN format), not a client-valid 0,00. ─────────────────────────────
	const belegOk = $derived(hasBelegFile || (keinBeleg && begruendung.trim().length >= 5));
	const missing = $derived.by(() => {
		const m: string[] = [];
		if (betragCents === null || betragCents <= 0) m.push('Betrag');
		if (!rechnungsdatum) m.push('Datum');
		if (!bezeichnung.trim()) m.push('Bezeichnung');
		if (!kategorieId) m.push('Kategorie');
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
			<!-- Betrag-Hero + Rechnungsdatum-Hero (identical anatomy; side-by-side even
			     on mobile per the plate — ANDY-LENS §2). -->
			<div>
				<div class="grid grid-cols-2 gap-2 sm:gap-3">
					<FieldGroup label="Betrag" for="betrag-display" required error={betragError ?? undefined}>
						{#snippet children({ describedBy, invalid })}
							<AmountField
								id="betrag-display"
								name="betragCents"
								value={values.betrag}
								type="ausgabe"
								sign="minus"
								aria-invalid={invalid}
								aria-describedby={describedBy}
								onchange={(c) => {
									betragCents = c;
									markDirty();
								}}
							/>
						{/snippet}
					</FieldGroup>
					<FieldGroup
						label="Rechnungsdatum"
						for="rechnungsdatum"
						required
						error={err('rechnungsdatum') ?? undefined}
					>
						{#snippet children({ describedBy, invalid })}
							<HeroDateField
								id="rechnungsdatum"
								name="rechnungsdatum"
								value={rechnungsdatum}
								required
								aria-invalid={invalid}
								aria-describedby={describedBy}
								onchange={(iso) => {
									rechnungsdatum = iso;
									markDirty();
								}}
							/>
						{/snippet}
					</FieldGroup>
				</div>
				<p class="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
					<span class="size-1.5 rounded-full bg-type-ausgabe" aria-hidden="true"></span>
					Wird als <b class="font-semibold text-ink-700">Ausgabe</b> mit Minus gebucht.
				</p>
			</div>

			<!-- Abfluss-Datum (payment date → Buchungsjahr) -->
			<FieldGroup
				label="Abfluss-Datum"
				for="abfluss_datum"
				required
				hint="Wann das Geld abgeflossen ist — bestimmt das Buchungsjahr (oft = Rechnungsdatum)."
				error={err('abfluss_datum') ?? undefined}
			>
				{#snippet children({ describedBy, invalid })}
					<CompactDateField
						id="abfluss_datum"
						name="abfluss_datum"
						value={abflussDatum}
						required
						aria-invalid={invalid}
						aria-describedby={describedBy}
						onchange={(iso) => {
							abflussDatum = iso;
							markDirty();
						}}
					/>
				{/snippet}
			</FieldGroup>

			<!-- Bezeichnung -->
			<FieldGroup
				label="Bezeichnung"
				for="bezeichnung"
				required
				error={err('bezeichnung') ?? undefined}
			>
				{#snippet children({ describedBy, invalid })}
					<input
						id="bezeichnung"
						name="bezeichnung"
						type="text"
						required
						maxlength={500}
						bind:value={bezeichnung}
						placeholder="z.B. Druckerpatronen, Raummiete März"
						aria-invalid={invalid}
						aria-describedby={describedBy}
						class={FIELD_CLASS}
					/>
				{/snippet}
			</FieldGroup>

			<!-- Kategorie (drives Sphäre strictly; sphere shown in the locked field below) -->
			<div class="flex flex-col gap-1.5">
				<KategoriePicker
					id="kategorie"
					required
					hideSphere
					options={expenseKategorien}
					value={kategorieId}
					onChange={(id) => {
						kategorieId = id;
						markDirty();
					}}
					onSphere={(s) => (kategorieSphere = s)}
				/>
				<!-- Hidden sphere mirror — server re-derives, this is caller-parity only. -->
				<input type="hidden" name="sphereSnapshot" value={kategorieSphere} />
				{#if err('kategorieId')}
					<p class="text-xs text-severity-critical">{err('kategorieId')}</p>
				{/if}
			</div>

			<!-- Sphäre — read-only, derived from the Kategorie (ADR-0002); appears
			     once a Kategorie is chosen (no misleading default before then). -->
			{#if kategorieId}
				<LockedSphereField sphere={kategorieSphere} />
			{/if}

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
				<FieldGroup label="Projekt" for="projectId" optional>
					{#snippet children({ describedBy })}
						<Select
							id="projectId"
							name="projectId"
							bind:value={projectId}
							aria-describedby={describedBy}
						>
							<option value="">— Kein Projekt —</option>
							{#each projects as p (p.id)}
								<option value={p.id}>{p.name}</option>
							{/each}
						</Select>
					{/snippet}
				</FieldGroup>
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
					<Select name="bezahltVonMemberId" bind:value={selectedMemberId}>
						<option value="">Mitglied auswählen…</option>
						{#each members as m (m.id)}
							<option value={m.id}>{m.nachname}, {m.vorname}</option>
						{/each}
					</Select>
				{:else}
					<!-- M8: real labels (the * lives on the label, never in the placeholder). -->
					<div class="flex flex-col gap-3">
						<FieldGroup label="Name" for="externName" required>
							{#snippet children({ describedBy })}
								<input
									id="externName"
									name="externName"
									type="text"
									placeholder="Name der externen Person"
									bind:value={externName}
									aria-describedby={describedBy}
									data-testid="extern-name-input"
									class={FIELD_CLASS}
								/>
							{/snippet}
						</FieldGroup>
						<FieldGroup label="IBAN" for="externIban" required>
							{#snippet children({ describedBy })}
								<input
									id="externIban"
									name="externIban"
									type="text"
									placeholder="DE00 0000 0000 0000 0000 00"
									bind:value={externIban}
									aria-describedby={describedBy}
									class="{FIELD_CLASS} font-mono"
								/>
							{/snippet}
						</FieldGroup>
						<FieldGroup label="E-Mail" for="externEmail" optional>
							{#snippet children({ describedBy })}
								<input
									id="externEmail"
									name="externEmail"
									type="email"
									placeholder="name@example.org"
									bind:value={externEmail}
									aria-describedby={describedBy}
									class={FIELD_CLASS}
								/>
							{/snippet}
						</FieldGroup>
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
							<FieldGroup label="Zahlungsart" for="zahlungsartId" required>
								{#snippet children({ describedBy })}
									<Select
										id="zahlungsartId"
										name="zahlungsartId"
										bind:value={zahlungsartId}
										aria-describedby={describedBy}
									>
										{#each zahlungsarten as z (z.id)}
											<option value={z.id}>{z.label}</option>
										{/each}
									</Select>
								{/snippet}
							</FieldGroup>
							<FieldGroup label="Erstattungsdatum" for="erstattetAm" required>
								{#snippet children({ describedBy })}
									<CompactDateField
										id="erstattetAm"
										name="erstattetAm"
										value={erstattetAm}
										aria-describedby={describedBy}
										onchange={(iso) => {
											erstattetAm = iso;
											markDirty();
										}}
									/>
								{/snippet}
							</FieldGroup>
						</div>
					{/if}
				</div>
			{:else}
				<!-- Verein path: optional Zahlungsart picker. -->
				<FieldGroup label="Zahlungsart" for="zahlungsartId-verein">
					{#snippet children({ describedBy })}
					<Select
						id="zahlungsartId-verein"
						name="zahlungsartId"
						bind:value={zahlungsartId}
						aria-describedby={describedBy}
					>
						<option value="">— Keine —</option>
						{#each zahlungsarten as z (z.id)}
							<option value={z.id}>{z.label}</option>
						{/each}
					</Select>
					{/snippet}
				</FieldGroup>
			{/if}

			<FieldGroup label="Kommentar" for="kommentar" optional>
				{#snippet children({ describedBy })}
					<Textarea
						id="kommentar"
						name="kommentar"
						rows={2}
						maxlength={2000}
						bind:value={kommentar}
						aria-describedby={describedBy}
					></Textarea>
				{/snippet}
			</FieldGroup>
		</div>
	</section>
</div>

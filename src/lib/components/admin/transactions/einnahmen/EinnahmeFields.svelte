<script lang="ts">
	/**
	 * EinnahmeFields — Aurora B2 (entry-modal-v4).
	 *
	 * Betrag-Hero (green, + sign) + Geldeingang-Hero share the field-row anatomy
	 * (ANDY-LENS §2) with the type-caption „Wird als Einnahme mit Plus gebucht.".
	 * The Sphäre is read-only, derived strictly from the Kategorie (ADR-0002).
	 * Beleg is OPTIONAL for income (no Verzicht gate) — a plain dropzone.
	 *
	 * PRESERVE the bind:value local-state pattern (EinnahmeFields bind-regression
	 * lesson): every editable field is local $state, seeded once from `values`.
	 */
	import { AmountField, DateField as HeroDateField } from '$lib/components/ui/hero-field/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { FieldGroup } from '$lib/components/ui/field-group/index.js';
	import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import LockedSphereField from '$lib/components/admin/transactions/fields/LockedSphereField.svelte';
	import BelegUpload from '$lib/components/forms/BelegUpload.svelte';
	import { FIELD_CLASS } from '$lib/components/ui/field-class/index.js';
	import { parseBetragCents } from '$lib/client/parse-betrag.js';
	import { bezeichnungsVorschlaege } from '$lib/domain/bezeichnung-vorschlaege.js';
	import type { Sphere } from '$lib/domain/sphere.js';

	interface KategorieOption {
		id: string;
		name: string;
		sphere: Sphere;
		eurZeile?: string | number | null;
	}

	/** Form re-hydration shape (mirrors `EinnahmeFormValues` in +page.server.ts). */
	interface EinnahmeValues {
		bezeichnung: string;
		betragEur: string;
		geldEingangDatum: string;
		kategorieId: string;
		projectId: string;
		kommentar: string;
	}

	/** Advisory footer gate readout (entry-modal-v4 `.gate-line`). */
	interface GateStatus {
		ok: boolean;
		text: string;
	}

	const today = new Date().toISOString().slice(0, 10);

	const EMPTY_VALUES: EinnahmeValues = {
		bezeichnung: '',
		betragEur: '',
		geldEingangDatum: '',
		kategorieId: '',
		projectId: '',
		kommentar: '',
	};

	interface Props {
		kategorien: KategorieOption[];
		projects: { id: string; name: string }[];
		values?: EinnahmeValues;
		errors?: Record<string, string[]>;
		onDirty?: () => void;
		onGate?: (status: GateStatus) => void;
		initialProjectId?: string;
	}

	let {
		kategorien,
		projects,
		values = EMPTY_VALUES,
		errors,
		onDirty,
		onGate,
		initialProjectId = '',
	}: Props = $props();

	function err(field: string): string | null {
		return errors?.[field]?.[0] ?? null;
	}

	// ── Field state (seeded once from `values`; bind:value owns it thereafter). ──
	// svelte-ignore state_referenced_locally
	let bezeichnung = $state(values.bezeichnung);
	// svelte-ignore state_referenced_locally
	let geldEingangDatum = $state(values.geldEingangDatum || today);
	// svelte-ignore state_referenced_locally
	let kommentar = $state(values.kommentar);
	// svelte-ignore state_referenced_locally
	let projectId = $state(values.projectId || initialProjectId);
	// #115: the picker submits the kategorie ID (createIncome resolves by id).
	// svelte-ignore state_referenced_locally
	let kategorieId = $state(values.kategorieId);
	// Sphere is DISPLAY-ONLY; createIncome re-derives it server-side (§4.5).
	// svelte-ignore state_referenced_locally
	let sphere = $state<Sphere | ''>(
		kategorien.find((k) => k.id === values.kategorieId)?.sphere ?? '',
	);
	// Track parsed cents for the gate readout (seed from prefill).
	// svelte-ignore state_referenced_locally
	let betragCents = $state<number | null>(
		values.betragEur ? (parseBetragCents(values.betragEur) || null) : null,
	);

	function markDirty() {
		onDirty?.();
	}

	// #115 Stufe 4: free-text Bezeichnungs-Vorschläge for the chosen Kategorie
	// (empty for Kategorien without hints → no datalist rendered).
	const vorschlaege = $derived(
		bezeichnungsVorschlaege(kategorien.find((k) => k.id === kategorieId)?.name),
	);

	// Betrag error (m7): 0,00 is client-submittable (gate = present) but flagged.
	const betragError = $derived(
		err('betragCents') ??
			(betragCents !== null && betragCents <= 0 ? 'Betrag muss größer als 0 sein.' : null),
	);

	// ── Gate readout: every required field present + valid (M4 + Wrinkle a); a
	// Betrag ≤ 0 counts as missing. Geldeingang is optional (seeded to today). ────
	const missing = $derived.by(() => {
		const m: string[] = [];
		if (betragCents === null || betragCents <= 0) m.push('Betrag');
		if (!bezeichnung.trim()) m.push('Bezeichnung');
		if (!kategorieId) m.push('Kategorie');
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

<div class="flex flex-col gap-4" data-slot="einnahme-fields">
	<!-- ── Section 1: Buchung ─────────────────────────────────────────────────── -->
	<section class="rounded-xl border border-hairline bg-card/60 p-4" data-slot="einnahme-section">
		<h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Buchung</h3>
		<div class="flex flex-col gap-3">
			<!-- Betrag-Hero + Geldeingang-Hero (side-by-side even on mobile) -->
			<div>
				<div class="grid grid-cols-2 gap-2 sm:gap-3">
					<FieldGroup label="Betrag" for="betragEur" required error={betragError ?? undefined}>
						{#snippet children({ describedBy, invalid })}
						<AmountField
							id="betragEur"
							name="betragCents"
							value={values.betragEur}
							type="einnahme"
							sign="plus"
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
					label="Geldeingang"
					for="geldEingangDatum"
					optional
					error={err('geldEingangDatum') ?? undefined}
				>
					{#snippet children({ describedBy, invalid })}
						<HeroDateField
							id="geldEingangDatum"
							name="geldEingangDatum"
							value={geldEingangDatum}
							aria-invalid={invalid}
							aria-describedby={describedBy}
							onchange={(iso) => {
								geldEingangDatum = iso;
								markDirty();
							}}
						/>
					{/snippet}
				</FieldGroup>
				</div>
				<p class="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
					<span class="size-1.5 rounded-full bg-type-einnahme" aria-hidden="true"></span>
					Wird als <b class="font-semibold text-ink-700">Einnahme</b> mit Plus gebucht.
				</p>
			</div>

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
						placeholder="z.B. Teilnahmebeitrag, Standgebühr"
						list={vorschlaege.length ? 'einnahme-bezeichnung-vorschlaege' : undefined}
						aria-invalid={invalid}
						aria-describedby={describedBy}
						oninput={markDirty}
						class={FIELD_CLASS}
					/>
					{#if vorschlaege.length}
						<!-- #115 Stufe 4: per-Kategorie hints; the field stays free-text. -->
						<datalist id="einnahme-bezeichnung-vorschlaege">
							{#each vorschlaege as v (v)}
								<option value={v}></option>
							{/each}
						</datalist>
					{/if}
				{/snippet}
			</FieldGroup>

			<!-- Kategorie (drives Sphäre strictly; sphere shown in the locked field below) -->
			<div class="flex flex-col gap-1.5">
				<KategoriePicker
					options={kategorien}
					value={kategorieId}
					required
					hideSphere
					onChange={(id) => {
						kategorieId = id;
						markDirty();
					}}
					onSphere={(s) => (sphere = s)}
				/>
				{#if err('kategorieId')}
					<p class="text-xs text-severity-critical">{err('kategorieId')}</p>
				{/if}
			</div>

			<!-- Sphäre — read-only, derived from the Kategorie (once one is chosen) -->
			{#if sphere}
				<LockedSphereField sphere={sphere as Sphere} />
			{/if}

			<!-- Beleg (OPTIONAL — plain dropzone, no Verzicht gate) -->
			<BelegUpload optional label="Beleg / Kontoauszug" error={err('beleg') ?? undefined} />
		</div>
	</section>

	<!-- ── Section 2: Zuordnung ───────────────────────────────────────────────── -->
	<section class="rounded-xl border border-hairline bg-card/60 p-4" data-slot="einnahme-section">
		<h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Zuordnung</h3>
		<div class="flex flex-col gap-3">
			<FieldGroup label="Projekt" for="projectId" optional>
				{#snippet children({ describedBy })}
					<Select
						id="projectId"
						name="projectId"
						bind:value={projectId}
						onchange={markDirty}
						aria-describedby={describedBy}
						data-testid="transaction-project-picker"
					>
						<option value="">— Kein Projekt —</option>
						{#each projects as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</Select>
				{/snippet}
			</FieldGroup>

			<FieldGroup label="Kommentar" for="kommentar" optional>
				{#snippet children({ describedBy })}
					<Textarea
						id="kommentar"
						name="kommentar"
						rows={3}
						maxlength={2000}
						bind:value={kommentar}
						oninput={markDirty}
						aria-describedby={describedBy}
					></Textarea>
				{/snippet}
			</FieldGroup>
		</div>
	</section>
</div>

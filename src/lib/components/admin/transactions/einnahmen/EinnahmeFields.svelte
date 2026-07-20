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
	import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import LockedSphereField from '$lib/components/admin/transactions/fields/LockedSphereField.svelte';
	import BelegUpload from '$lib/components/admin/transactions/fields/BelegUpload.svelte';
	import { FIELD_CLASS } from '$lib/components/admin/transactions/fields/field-class.js';
	import { parseBetragCents } from '$lib/client/parse-betrag.js';
	import type { Sphere } from '$lib/domain/sphere.js';

	interface KategorieOption {
		name: string;
		sphere: Sphere;
		eurZeile?: string | number | null;
	}

	/** Form re-hydration shape (mirrors `EinnahmeFormValues` in +page.server.ts). */
	interface EinnahmeValues {
		bezeichnung: string;
		betragEur: string;
		geldEingangDatum: string;
		kategorieName: string;
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
		kategorieName: '',
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
	// svelte-ignore state_referenced_locally
	let kategorieName = $state(values.kategorieName);
	// Sphere is DISPLAY-ONLY; createIncome re-derives it server-side (§4.5).
	// svelte-ignore state_referenced_locally
	let sphere = $state<Sphere | ''>(
		kategorien.find((k) => k.name === values.kategorieName)?.sphere ?? '',
	);
	// Track parsed cents for the gate readout (seed from prefill).
	// svelte-ignore state_referenced_locally
	let betragCents = $state<number | null>(
		values.betragEur ? (parseBetragCents(values.betragEur) || null) : null,
	);

	function markDirty() {
		onDirty?.();
	}

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
		if (!kategorieName) m.push('Kategorie');
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
					<div class="flex flex-col gap-1.5">
						<label for="betragEur" class="text-sm font-medium text-ink-900">
							Betrag <span class="text-severity-critical" aria-hidden="true">*</span>
						</label>
						<AmountField
							id="betragEur"
							name="betragCents"
							value={values.betragEur}
							type="einnahme"
							sign="plus"
							aria-invalid={betragError ? true : undefined}
							onchange={(c) => {
								betragCents = c;
								markDirty();
							}}
						/>
						{#if betragError}
							<p class="text-xs text-severity-critical">{betragError}</p>
						{/if}
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="geldEingangDatum" class="text-sm font-medium text-ink-900"
							>Geldeingang (optional)</label
						>
						<HeroDateField
							id="geldEingangDatum"
							name="geldEingangDatum"
							value={geldEingangDatum}
							aria-invalid={err('geldEingangDatum') ? true : undefined}
							onchange={(iso) => {
								geldEingangDatum = iso;
								markDirty();
							}}
						/>
						{#if err('geldEingangDatum')}
							<p class="text-xs text-severity-critical">{err('geldEingangDatum')}</p>
						{/if}
					</div>
				</div>
				<p class="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
					<span class="size-1.5 rounded-full bg-type-einnahme" aria-hidden="true"></span>
					Wird als <b class="font-semibold text-ink-700">Einnahme</b> mit Plus gebucht.
				</p>
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
					maxlength="500"
					bind:value={bezeichnung}
					placeholder="z.B. Teilnahmebeitrag, Standgebühr"
					aria-invalid={err('bezeichnung') ? true : undefined}
					oninput={markDirty}
					class={FIELD_CLASS}
				/>
				{#if err('bezeichnung')}
					<p class="text-xs text-severity-critical">{err('bezeichnung')}</p>
				{/if}
			</div>

			<!-- Kategorie (drives Sphäre strictly; sphere shown in the locked field below) -->
			<div class="flex flex-col gap-1.5">
				<KategoriePicker
					name="kategorieNameSnapshot"
					options={kategorien}
					value={kategorieName}
					required
					hideSphere
					onChange={(name) => {
						kategorieName = name;
						markDirty();
					}}
					onSphere={(s) => (sphere = s)}
				/>
				{#if err('kategorieNameSnapshot')}
					<p class="text-xs text-severity-critical">{err('kategorieNameSnapshot')}</p>
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
			<!-- Projekt (optional) -->
			<div class="flex flex-col gap-1.5">
				<label for="projectId" class="text-sm font-medium text-ink-900">Projekt (optional)</label>
				<select
					id="projectId"
					name="projectId"
					bind:value={projectId}
					onchange={markDirty}
					data-testid="transaction-project-picker"
					class={FIELD_CLASS}
				>
					<option value="">— Kein Projekt —</option>
					{#each projects as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</div>

			<!-- Kommentar -->
			<div class="flex flex-col gap-1.5">
				<label for="kommentar" class="text-sm font-medium text-ink-900">Kommentar</label>
				<textarea
					id="kommentar"
					name="kommentar"
					rows="3"
					maxlength="2000"
					bind:value={kommentar}
					oninput={markDirty}
					class="w-full rounded-[10px] border border-hairline bg-card px-3 py-2.5 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:text-sm"
				></textarea>
			</div>
		</div>
	</section>
</div>

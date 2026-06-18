<script lang="ts">
	/**
	 * EinnahmeFields — Package C2. Aurora redesign.
	 *
	 * Changes from pre-C2:
	 * - Betrag → type=text inputmode=decimal + parseBetragCents (ADR-0003)
	 * - BelegUpload `optional` replaces the plain <input type=file>
	 * - geldEingangDatum seeds today on a fresh form
	 * - FIELD_CLASS throughout
	 *
	 * PRESERVE bind:value local-state pattern (EinnahmeFields bind-regression lesson).
	 */
	import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import BelegUpload from '$lib/components/admin/transactions/fields/BelegUpload.svelte';
	import { DateField } from '$lib/components/ui/date-field/index.js';
	import { FIELD_CLASS } from '$lib/components/admin/transactions/fields/field-class.js';
	import { parseBetragCents } from '$lib/client/parse-betrag.js';
	import type { Sphere } from '$lib/domain/sphere.js';

	interface KategorieOption {
		name: string;
		sphere: Sphere;
		eurZeile?: string | number | null;
	}

	/**
	 * Form re-hydration shape (mirrors `EinnahmeFormValues` in +page.server.ts).
	 * Seeds the form on a 422 re-hydrate (?/create echoes the submitted values
	 * back) so input is never wiped. A fresh visit seeds all-empty values.
	 */
	interface EinnahmeValues {
		bezeichnung: string;
		betragEur: string;
		geldEingangDatum: string;
		kategorieName: string;
		projectId: string;
		kommentar: string;
	}

	const today = new Date().toISOString().slice(0, 10);

	const EMPTY_VALUES: EinnahmeValues = {
		bezeichnung: '',
		betragEur: '',
		geldEingangDatum: '',
		kategorieName: '',
		projectId: '',
		kommentar: ''
	};

	interface Props {
		/** Income kategorie options (name = NAME-SNAPSHOT, P2-04). */
		kategorien: KategorieOption[];
		/** Active projects for the optional Projekt field. */
		projects: { id: string; name: string }[];
		/** Re-hydrate seed (failed-submit echo); defaults to all-empty on a fresh form. */
		values?: EinnahmeValues;
		/** Per-field validation errors from a 422 (keyed by field name). */
		errors?: Record<string, string[]>;
		/** Fired on the first edit so the tab can flip the shell's `dirty`. */
		onDirty?: () => void;
		/** Pre-selected project id (from ?projectId= URL param). */
		initialProjectId?: string;
	}

	let {
		kategorien,
		projects,
		values = EMPTY_VALUES,
		errors,
		onDirty,
		initialProjectId = ''
	}: Props = $props();

	function err(field: string): string | null {
		return errors?.[field]?.[0] ?? null;
	}

	// ── Field state. Seeded from `values` so a 422 re-hydrate restores input;
	// projectId also honors the ?projectId= prefill on a FRESH visit (the
	// re-hydrated values.projectId wins when present). ──
	// NOTE: every editable field MUST be local $state + bind:value (NOT a
	// one-way `value={values.x}`): a controlled one-way bind to the constant
	// `values` prop re-asserts the seed over the user's keystrokes on the next
	// re-render, silently wiping `bezeichnung`/`kommentar` (a required field →
	// the form fails checkValidity() and never submits). Bind seeds once, then
	// the local state owns the value.
	// svelte-ignore state_referenced_locally
	let bezeichnung = $state(values.bezeichnung);
	// svelte-ignore state_referenced_locally
	let betragEur = $state(values.betragEur);
	// Seed geldEingangDatum to today on a fresh form (C2); re-hydrate keeps echoed value.
	// svelte-ignore state_referenced_locally
	let geldEingangDatum = $state(values.geldEingangDatum || today);
	// svelte-ignore state_referenced_locally
	let kommentar = $state(values.kommentar);
	// svelte-ignore state_referenced_locally
	let projectId = $state(values.projectId || initialProjectId);
	// svelte-ignore state_referenced_locally
	let kategorieName = $state(values.kategorieName);
	// Sphere is DISPLAY-ONLY here — createIncome re-derives it server-side from
	// the chosen kategorie (§4.5). We mirror the picker's derived sphere into a
	// hidden field purely for parity/debugging; the server never trusts it.
	// svelte-ignore state_referenced_locally
	let sphere = $state<Sphere | ''>(
		kategorien.find((k) => k.name === values.kategorieName)?.sphere ?? ''
	);

	// Betrag: type=text + inputmode=decimal + parseBetragCents (C2).
	// Local $state preserves typed text across re-renders (bind-regression lesson).
	const betragCents = $derived(
		betragEur ? String(parseBetragCents(betragEur) || 0) : '0'
	);

	function markDirty() {
		onDirty?.();
	}
</script>

<div class="flex flex-col gap-4" data-slot="einnahme-fields">
	<!-- Hidden canonical Betrag in cents (the form submits this, not the € text). -->
	<input type="hidden" name="betragCents" value={betragCents} />
	<!-- Sphere mirror (display parity only; server re-derives from kategorie). -->
	<input type="hidden" name="sphereSnapshot" value={sphere} />

	<!-- Bezeichnung -->
	<div class="flex flex-col gap-1.5">
		<label for="bezeichnung" class="text-sm font-medium text-ink-900">
			Bezeichnung<span class="text-severity-critical" aria-hidden="true">&nbsp;*</span>
		</label>
		<input
			id="bezeichnung"
			name="bezeichnung"
			type="text"
			required
			maxlength="500"
			bind:value={bezeichnung}
			aria-invalid={err('bezeichnung') ? true : undefined}
			oninput={markDirty}
			class={FIELD_CLASS}
		/>
		{#if err('bezeichnung')}
			<p class="text-xs text-severity-critical">{err('bezeichnung')}</p>
		{/if}
	</div>

	<!-- Betrag (type=text inputmode=decimal → hidden betragCents) -->
	<div class="flex flex-col gap-1.5">
		<label for="betragEur" class="text-sm font-medium text-ink-900">
			Betrag (€)<span class="text-severity-critical" aria-hidden="true">&nbsp;*</span>
		</label>
		<div class="relative">
			<span class="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-400" aria-hidden="true">€</span>
			<input
				id="betragEur"
				type="text"
				inputmode="decimal"
				required
				bind:value={betragEur}
				placeholder="0,00"
				aria-invalid={err('betragCents') ? true : undefined}
				oninput={markDirty}
				class="{FIELD_CLASS} pl-7 tabular-nums"
			/>
		</div>
		{#if err('betragCents')}
			<p class="text-xs text-severity-critical">{err('betragCents')}</p>
		{/if}
	</div>

	<!-- Geldeingang (locale-locked DateField → hidden ISO geldEingangDatum) -->
	<div class="flex flex-col gap-1.5">
		<label for="geldEingangDatum" class="text-sm font-medium text-ink-900">Geldeingang</label>
		<DateField
			id="geldEingangDatum"
			name="geldEingangDatum"
			value={geldEingangDatum}
			onchange={(iso) => {
				geldEingangDatum = iso;
				markDirty();
			}}
		/>
		{#if err('geldEingangDatum')}
			<p class="text-xs text-severity-critical">{err('geldEingangDatum')}</p>
		{/if}
	</div>

	<!-- Kategorie (+ derived Sphäre via the shared picker). The submitted field is
	     `kategorieNameSnapshot` — the name the server's incomeSchema reads (and the
	     picker's default). Kept explicit here for parity with the other tx forms. -->
	<div class="flex flex-col gap-1.5">
		<KategoriePicker
			name="kategorieNameSnapshot"
			options={kategorien}
			value={kategorieName}
			required
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
			<option value="">— kein Projekt —</option>
			{#each projects as p (p.id)}
				<option value={p.id}>{p.name}</option>
			{/each}
		</select>
	</div>

	<!-- Beleg (OPTIONAL — BelegUpload with optional=true, no keinBeleg arm) -->
	<BelegUpload optional error={err('beleg') ?? undefined} />

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
			class="w-full rounded-[10px] border border-hairline bg-white px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
		></textarea>
	</div>
</div>

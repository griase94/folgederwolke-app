<script lang="ts">
	/**
	 * EinnahmeFields — Phase 5 / Task 3 (Tier C2). The `fields` snippet body the
	 * EntryFormShell injects into its <form> for the freie-Einnahme entry form.
	 *
	 * Fields: Bezeichnung · Betrag (€ input → hidden betragCents) · Geldeingang
	 * (DateField → geldEingangDatum) · Kategorie (KategoriePicker, drives the
	 * displayed Sphäre — NO project override, §4.5) · Projekt (optional) · Beleg
	 * (OPTIONAL — a plain file input, NO "Kein Beleg" → Begründung reveal) ·
	 * Kommentar.
	 *
	 * NO bezahlt-von, NO auto-pay (those are Ausgaben-only). The component owns
	 * its field state + the kategorie→sphere derivation; it reports edits via
	 * `onDirty` so the tab can gate the EntryFormShell's Speichern button.
	 */
	import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import { DateField } from '$lib/components/ui/date-field/index.js';
	import type { Sphere } from '$lib/domain/sphere.js';

	interface KategorieOption {
		name: string;
		sphere: Sphere;
		eurZeile?: string | number | null;
	}

	interface Props {
		/** Income kategorie options (name = NAME-SNAPSHOT, P2-04). */
		kategorien: KategorieOption[];
		/** Active projects for the optional Projekt field. */
		projects: { id: string; name: string }[];
		/** Fired on the first edit so the tab can flip the shell's `dirty`. */
		onDirty?: () => void;
		/** Pre-selected project id (from ?projectId= URL param). */
		initialProjectId?: string;
	}

	let { kategorien, projects, onDirty, initialProjectId = '' }: Props = $props();

	// ── Field state ───────────────────────────────────────────────────────────
	let betragEur = $state('');
	let geldEingangDatum = $state('');
	// svelte-ignore state_referenced_locally
	let projectId = $state(initialProjectId);
	let kategorieName = $state('');
	// Sphere is DISPLAY-ONLY here — createIncome re-derives it server-side from
	// the chosen kategorie (§4.5). We mirror the picker's derived sphere into a
	// hidden field purely for parity/debugging; the server never trusts it.
	let sphere = $state<Sphere | ''>('');

	// € → integer cents (ADR-0003). Empty / NaN → 0 (the schema's positive-int
	// gate rejects it, surfacing the validation error).
	const betragCents = $derived(Math.round(parseFloat(betragEur || '0') * 100));

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
		<label for="bezeichnung" class="text-sm font-medium text-foreground">
			Bezeichnung<span class="text-destructive" aria-hidden="true">&nbsp;*</span>
		</label>
		<input
			id="bezeichnung"
			name="bezeichnung"
			type="text"
			required
			maxlength="500"
			oninput={markDirty}
			class="h-11 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
		/>
	</div>

	<!-- Betrag (€) -->
	<div class="flex flex-col gap-1.5">
		<label for="betragEur" class="text-sm font-medium text-foreground">
			Betrag (€)<span class="text-destructive" aria-hidden="true">&nbsp;*</span>
		</label>
		<input
			id="betragEur"
			type="number"
			inputmode="decimal"
			step="0.01"
			min="0"
			required
			bind:value={betragEur}
			oninput={markDirty}
			class="h-11 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-ring"
		/>
	</div>

	<!-- Geldeingang (locale-locked DateField → hidden ISO geldEingangDatum) -->
	<div class="flex flex-col gap-1.5">
		<label for="geldEingangDatum" class="text-sm font-medium text-foreground">Geldeingang</label>
		<DateField
			id="geldEingangDatum"
			name="geldEingangDatum"
			value={geldEingangDatum}
			onchange={(iso) => {
				geldEingangDatum = iso;
				markDirty();
			}}
		/>
	</div>

	<!-- Kategorie (+ derived Sphäre via the shared picker) -->
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

	<!-- Projekt (optional) -->
	<div class="flex flex-col gap-1.5">
		<label for="projectId" class="text-sm font-medium text-foreground">Projekt (optional)</label>
		<select
			id="projectId"
			name="projectId"
			bind:value={projectId}
			onchange={markDirty}
			data-testid="transaction-project-picker"
			class="h-11 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
		>
			<option value="">— kein Projekt —</option>
			{#each projects as p (p.id)}
				<option value={p.id}>{p.name}</option>
			{/each}
		</select>
	</div>

	<!-- Beleg (OPTIONAL — plain file input, NO Kein-Beleg → Begründung reveal) -->
	<div class="flex flex-col gap-1.5">
		<label for="beleg" class="text-sm font-medium text-foreground">Beleg (optional)</label>
		<input
			id="beleg"
			name="beleg"
			type="file"
			accept="image/*,application/pdf"
			onchange={markDirty}
			class="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-accent"
		/>
	</div>

	<!-- Kommentar -->
	<div class="flex flex-col gap-1.5">
		<label for="kommentar" class="text-sm font-medium text-foreground">Kommentar</label>
		<textarea
			id="kommentar"
			name="kommentar"
			rows="3"
			maxlength="2000"
			oninput={markDirty}
			class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
		></textarea>
	</div>
</div>

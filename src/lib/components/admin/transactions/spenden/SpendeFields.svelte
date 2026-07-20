<!--
  SpendeFields — Aurora B2 (entry-modal-v4).

  Betrag-Hero (violet, + sign) + Zuwendungsdatum-Hero share the field-row anatomy
  (ANDY-LENS §2) with the type-caption „Wird als Spende mit Plus gebucht.". The
  Sphäre is read-only „Spenden gehören immer in den ideellen Bereich." and the
  Kategorie is derived server-side (DerivedKategorieBadge — no picker). A soft
  brand callout explains that a Zuwendungsbestätigung can be issued AFTER saving
  (§4.6 copy — never claims one is generated automatically).

  Pickers (Spendenart / Zweckbindung / Spender) are neutral segmented toggles
  (never brand pink on a booking control — ANDY-LENS §4).
-->
<script lang="ts">
	import { AmountField, DateField as HeroDateField } from '$lib/components/ui/hero-field/index.js';
	import BelegUpload from '$lib/components/admin/transactions/fields/BelegUpload.svelte';
	import LockedSphereField from '$lib/components/admin/transactions/fields/LockedSphereField.svelte';
	import DerivedKategorieBadge from './DerivedKategorieBadge.svelte';
	import FileCheckIcon from '@lucide/svelte/icons/file-check';
	import { FIELD_CLASS } from '$lib/components/admin/transactions/fields/field-class.js';
	import {
		deriveDonationKategorieName,
		type SpendeKind,
		type ZweckbindungKind,
	} from '$lib/domain/spenden-kategorie.js';

	const today = new Date().toISOString().slice(0, 10);

	interface MemberOpt {
		id: string;
		label: string;
		adresse?: string | null;
		email?: string | null;
	}
	interface ProjectOpt {
		id: string;
		name: string;
	}

	/** Advisory footer gate readout (entry-modal-v4 `.gate-line`). */
	interface GateStatus {
		ok: boolean;
		text: string;
	}

	interface Props {
		members?: MemberOpt[];
		projects?: ProjectOpt[];
		values?: Record<string, unknown>;
		errors?: Record<string, string[]>;
		onDirty?: () => void;
		onGate?: (status: GateStatus) => void;
		anlageGemZeilen?: Record<string, number | null>;
	}

	let {
		members = [],
		projects = [],
		values = {},
		errors = {},
		onDirty,
		onGate,
		anlageGemZeilen = {},
	}: Props = $props();

	function v(key: string): string {
		const raw = values[key];
		return raw == null ? '' : String(raw);
	}

	let spendeKind = $state<SpendeKind>((v('spende_kind') as SpendeKind) || 'geldspende');
	let zweckbindungKind = $state<ZweckbindungKind>(
		(v('zweckbindung_kind') as ZweckbindungKind) || 'zweckfrei',
	);
	let spenderMode = $state<'member' | 'extern'>(v('member_id') ? 'member' : 'extern');
	let selectedMemberId = $state(v('member_id'));
	let zugewendetAm = $state(v('zugewendet_am') || today);

	let spenderName = $state(v('spender_name'));
	let spenderAdresse = $state(v('spender_adresse'));
	let spenderEmail = $state(v('spender_email'));

	// Betrag → hero AmountField (submits hidden name=betragCents). Seed the display
	// from a re-hydrate; track the parsed cents locally for the gate readout.
	const betragSeed = v('betragCents') ? String(Number(v('betragCents')) / 100) : '';
	let betragCents = $state<number | null>(v('betragCents') ? Number(v('betragCents')) : null);

	const isSach = $derived(spendeKind === 'sachspende');
	const isZweckgebunden = $derived(zweckbindungKind === 'zweckgebunden');

	const derivedKategorieName = $derived(deriveDonationKategorieName(spendeKind, zweckbindungKind));
	const anlageGemZeile = $derived(anlageGemZeilen[derivedKategorieName] ?? null);

	const selectedMember = $derived(members.find((m) => m.id === selectedMemberId));
	const memberAdresse = $derived(selectedMember?.adresse ?? '');

	function markDirty() {
		onDirty?.();
	}

	function err(key: string): string | null {
		return errors[key]?.[0] ?? null;
	}

	// Neutral segmented toggle classes (never brand pink on a booking control).
	function segClass(on: boolean, disabled = false): string {
		const base =
			'inline-flex min-h-10 flex-1 items-center justify-center rounded-[7px] px-3 py-2 text-sm font-medium transition-colors';
		if (disabled) return `${base} cursor-not-allowed text-ink-300`;
		return on
			? `${base} bg-card text-ink-900 shadow-sm ring-1 ring-hairline`
			: `${base} bg-transparent text-ink-500 hover:text-ink-900`;
	}
	const SEG_TRACK = 'flex gap-1 rounded-[10px] border border-hairline bg-secondary p-1';

	// ── Gate readout (advisory only). ─────────────────────────────────────────
	const spenderOk = $derived(
		spenderMode === 'member' ? !!selectedMemberId : spenderName.trim().length > 0,
	);
	const missing = $derived.by(() => {
		const m: string[] = [];
		if (!betragCents || betragCents <= 0) m.push(isSach ? 'Zeitwert' : 'Betrag');
		if (!zugewendetAm) m.push('Datum');
		if (!spenderOk) m.push('Spender:in');
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

<div class="flex flex-col gap-5">
	<!-- Betrag-Hero + Zuwendungsdatum-Hero (identical anatomy) -->
	<div>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div class="flex flex-col gap-1.5">
				<label for="betrag-display" class="text-sm font-medium text-ink-900">
					{isSach ? 'Gemeiner Wert (§ 9 BewG)' : 'Betrag'}
					<span class="text-severity-critical" aria-hidden="true">*</span>
				</label>
				<AmountField
					id="betrag-display"
					name="betragCents"
					value={betragSeed}
					type="spende"
					sign="plus"
					onchange={(c) => {
						betragCents = c;
						markDirty();
					}}
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label for="zugewendet_am" class="text-sm font-medium text-ink-900">
					Zuwendungsdatum <span class="text-severity-critical" aria-hidden="true">*</span>
				</label>
				<HeroDateField
					id="zugewendet_am"
					name="zugewendet_am"
					value={zugewendetAm}
					required
					onchange={(iso) => {
						zugewendetAm = iso;
						markDirty();
					}}
				/>
			</div>
		</div>
		<p class="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
			<span class="size-1.5 rounded-full bg-type-spende" aria-hidden="true"></span>
			Wird als <b class="font-semibold text-ink-700">Spende</b> mit Plus gebucht.
		</p>
	</div>

	<!-- Spendenart -->
	<fieldset>
		<legend class="mb-1.5 block text-sm font-medium text-ink-900">
			Spendenart <span class="text-severity-critical" aria-hidden="true">*</span>
		</legend>
		<div class={SEG_TRACK} role="radiogroup" aria-label="Spendenart">
			{#each [['geldspende', 'Geldspende'], ['sachspende', 'Sachspende']] as [k, l] (k)}
				{@const on = spendeKind === k}
				<button
					type="button"
					role="radio"
					aria-checked={on}
					onclick={() => {
						spendeKind = k as SpendeKind;
						markDirty();
					}}
					data-state={on ? 'on' : 'off'}
					class={segClass(on)}
					data-testid={`spendeart-${k}`}
				>
					{l}
				</button>
			{/each}
			<button
				type="button"
				disabled
				title="Aufwandsspende-Workflow folgt in Phase 2"
				class={segClass(false, true)}
				data-testid="spendeart-aufwand-disabled"
			>
				Aufwand
			</button>
		</div>
		<input type="hidden" name="spende_kind" value={spendeKind} />
	</fieldset>

	<!-- Zweckbindung -->
	<fieldset>
		<legend class="mb-1.5 block text-sm font-medium text-ink-900">
			Zweckbindung <span class="text-severity-critical" aria-hidden="true">*</span>
		</legend>
		<div class={SEG_TRACK} role="radiogroup" aria-label="Zweckbindung">
			{#each [['zweckfrei', 'Zweckfrei'], ['zweckgebunden', 'Zweckgebunden']] as [k, l] (k)}
				{@const on = zweckbindungKind === k}
				<button
					type="button"
					role="radio"
					aria-checked={on}
					onclick={() => {
						zweckbindungKind = k as ZweckbindungKind;
						markDirty();
					}}
					data-state={on ? 'on' : 'off'}
					class={segClass(on)}
					data-testid={`zweckbindung-${k}`}
				>
					{l}
				</button>
			{/each}
		</div>
		<input type="hidden" name="zweckbindung_kind" value={zweckbindungKind} />

		{#if isZweckgebunden}
			<div class="mt-2 space-y-1">
				<label for="zweckbindung_text" class="block text-sm font-medium text-ink-900">
					Zweckbindungs-Text <span class="text-severity-critical" aria-hidden="true">*</span>
				</label>
				<p class="text-xs text-muted-foreground">
					§ 55 AO — der vom Spender benannte Verwendungszweck.
				</p>
				<input
					id="zweckbindung_text"
					name="zweckbindung_text"
					type="text"
					value={v('zweckbindung_text')}
					oninput={markDirty}
					required
					data-testid="zweckbindung-text"
					class={FIELD_CLASS}
				/>
				{#if err('zweckbindung_text')}
					<p class="text-xs text-severity-critical">{err('zweckbindung_text')}</p>
				{/if}
			</div>
		{/if}
	</fieldset>

	<!-- Sphäre — read-only; a Spende is always ideeller (ADR-0002). -->
	<LockedSphereField sphere="ideeller" hint="Spenden gehören immer in den ideellen Bereich." />

	<!-- Zuwendungsbestätigung hint (§4.6 copy — CAN issue after saving, not auto). -->
	<div class="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
		<span
			class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-text"
			aria-hidden="true"
		>
			<FileCheckIcon class="size-4" />
		</span>
		<div class="min-w-0">
			<div class="text-sm font-semibold text-ink-900">Zuwendungsbestätigung</div>
			<p class="mt-0.5 text-xs leading-relaxed text-ink-500">
				Eine Zuwendungsbestätigung <b class="font-semibold text-ink-700"
					>kannst du nach dem Speichern ausstellen</b
				> — dafür sind Name und Anschrift nötig. Bei einer Sachspende zusätzlich eine
				Wertermittlung (Beschreibung + Zeitwert).
			</p>
		</div>
	</div>

	<!-- Sachspende Wertermittlung reveal -->
	{#if isSach}
		<fieldset
			class="space-y-3 rounded-xl border border-hairline bg-card/60 p-4"
			data-testid="sachspende-reveal"
		>
			<legend class="px-1 text-sm font-medium text-ink-900">Sachspende — Wertermittlung</legend>

			<div class="space-y-1.5">
				<label for="wertermittlung_methode" class="block text-sm font-medium text-ink-900">
					Wertermittlungsmethode <span class="text-severity-critical" aria-hidden="true">*</span>
				</label>
				<select
					id="wertermittlung_methode"
					name="wertermittlung_methode"
					value={v('wertermittlung_methode')}
					onchange={markDirty}
					data-testid="wertermittlung-methode"
					class={FIELD_CLASS}
				>
					<option value="">— wählen —</option>
					<option value="marktpreis">Marktpreis</option>
					<option value="kaufbeleg">Kaufbeleg</option>
					<option value="schaetzung">Schätzung</option>
					<option value="buchwert">Buchwert</option>
				</select>
				{#if err('wertermittlung_methode')}
					<p class="text-xs text-severity-critical">{err('wertermittlung_methode')}</p>
				{/if}
			</div>

			<div class="space-y-1.5">
				<label for="zustand_beschreibung" class="block text-sm font-medium text-ink-900">
					Beschreibung des Gegenstands (Art, Zustand)
					<span class="text-severity-critical" aria-hidden="true">*</span>
				</label>
				<textarea
					id="zustand_beschreibung"
					name="zustand_beschreibung"
					rows="2"
					value={v('zustand_beschreibung')}
					oninput={markDirty}
					data-testid="zustand-beschreibung"
					class="w-full rounded-[10px] border border-hairline bg-card px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
				></textarea>
				{#if err('zustand_beschreibung')}
					<p class="text-xs text-severity-critical">{err('zustand_beschreibung')}</p>
				{/if}
			</div>

			<!-- Herkunftsbeleg (Sachspende) — optional dropzone -->
			<BelegUpload
				name="herkunftsbeleg"
				label="Herkunftsbeleg"
				accept=".pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
				optional
			/>

			<label class="flex items-center gap-2 text-sm text-ink-900">
				<input
					type="checkbox"
					name="betriebsvermoegen"
					value="true"
					checked={v('betriebsvermoegen') === 'true'}
					onchange={markDirty}
					data-testid="betriebsvermoegen"
					class="size-4 rounded border-hairline accent-primary"
				/>
				Sachspende aus Betriebsvermögen
			</label>
		</fieldset>
	{:else}
		<!-- Geldspende: optional main Beleg / Kontoauszug (§4.3 — encouraged). -->
		<BelegUpload
			label="Beleg / Kontoauszug"
			accept=".pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
			optional
			error={err('beleg') ?? undefined}
		/>
	{/if}

	<!-- Spender — neutral segmented toggle -->
	<fieldset>
		<legend class="mb-1.5 block text-sm font-medium text-ink-900">
			Spender <span class="text-severity-critical" aria-hidden="true">*</span>
		</legend>
		<div class="{SEG_TRACK} mb-2" role="radiogroup" aria-label="Spender">
			{#each [['member', 'Mitglied'], ['extern', 'Externe Person']] as [k, l] (k)}
				{@const on = spenderMode === k}
				<button
					type="button"
					role="radio"
					aria-checked={on}
					onclick={() => {
						spenderMode = k as 'member' | 'extern';
						if (k === 'extern') selectedMemberId = '';
						markDirty();
					}}
					data-state={on ? 'on' : 'off'}
					class={segClass(on)}
					data-testid={`spender-mode-${k}`}
				>
					{l}
				</button>
			{/each}
		</div>

		{#if spenderMode === 'member'}
			<select
				name="member_id"
				bind:value={selectedMemberId}
				onchange={markDirty}
				data-testid="spender-member-select"
				class={FIELD_CLASS}
			>
				<option value="">Mitglied auswählen…</option>
				{#each members as m (m.id)}
					<option value={m.id}>{m.label}</option>
				{/each}
			</select>
			{#if selectedMember}
				<p class="mt-1 text-xs text-muted-foreground" data-testid="member-adresse-autofill">
					Adresse: {memberAdresse || '— im Mitgliedsprofil hinterlegen —'}
				</p>
			{/if}
		{:else}
			<input type="hidden" name="member_id" value="" />
			<div class="space-y-2">
				<input
					name="spender_name"
					type="text"
					placeholder="Name *"
					bind:value={spenderName}
					oninput={markDirty}
					required
					data-testid="spender-name-input"
					class={FIELD_CLASS}
				/>
				{#if err('spender_name')}
					<p class="text-xs text-severity-critical">{err('spender_name')}</p>
				{/if}
				<input
					name="spender_adresse"
					type="text"
					placeholder="Adresse *"
					bind:value={spenderAdresse}
					oninput={markDirty}
					required
					data-testid="spender-adresse-input"
					class={FIELD_CLASS}
				/>
				{#if err('spender_adresse')}
					<p class="text-xs text-severity-critical">{err('spender_adresse')}</p>
				{/if}
				<input
					name="spender_email"
					type="email"
					placeholder="E-Mail (optional)"
					bind:value={spenderEmail}
					oninput={markDirty}
					class={FIELD_CLASS}
				/>
			</div>
		{/if}
	</fieldset>

	<!-- Projekt (optional, Mittelverwendung) -->
	{#if projects.length}
		<div>
			<label for="project_id" class="mb-1.5 block text-sm font-medium text-ink-900">
				Projekt <span class="text-xs font-normal text-muted-foreground">(optional)</span>
			</label>
			<select
				id="project_id"
				name="project_id"
				value={v('project_id')}
				onchange={markDirty}
				class={FIELD_CLASS}
			>
				<option value="">— kein Projekt —</option>
				{#each projects as p (p.id)}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
		</div>
	{/if}

	<!-- Read-only derived-Kategorie badge (NO Kategorie picker). -->
	<DerivedKategorieBadge {spendeKind} {zweckbindungKind} {anlageGemZeile} />
</div>

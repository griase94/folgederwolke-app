<!--
  SpendeFields — the Spenden entry-form fields snippet (spec §9.2).

  The 3-picker derived form rendered inside EntryFormShell's scrollable body:
    1. Spendenart*   — Geldspende / Sachspende / Aufwand (disabled — Phase 2)
    2. Zweckbindung* — zweckfrei / zweckgebunden (reveals the required §55 AO Text)
    3. Spender*      — Mitglied (combobox + address autofill) | Externe Person

  Plus: optional Projekt (Mittelverwendung); the Sachspende reveal block
  (Gemeiner Wert = Betrag, §9 BewG · Wertermittlungsmethode* · Beschreibung des
  Gegenstands* · optional Herkunftsbeleg · "aus Betriebsvermögen" flag); the
  optional main Beleg/Kontoauszug (Geldspende, encouraged not enforced); and the
  read-only DerivedKategorieBadge (NO Kategorie picker — it is derived server-side).

  Betrag → hidden `betragCents` (native number step=0.01, the established `neu`
  pattern). Date via the ui/date-field primitive (hidden ISO mirror).
-->
<script lang="ts">
	import DateField from '$lib/components/ui/date-field/DateField.svelte';
	import DerivedKategorieBadge from './DerivedKategorieBadge.svelte';
	import {
		deriveDonationKategorieName,
		type SpendeKind,
		type ZweckbindungKind
	} from '$lib/domain/spenden-kategorie.js';

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

	interface Props {
		members?: MemberOpt[];
		projects?: ProjectOpt[];
		/** Prior values to re-hydrate after a failed submit (fail() values). */
		values?: Record<string, unknown>;
		errors?: Record<string, string[]>;
		/** Notify the parent that a field changed (drives EntryFormShell `dirty`). */
		onDirty?: () => void;
		/** name → Anlage-Gem-Zeile for the derivable donation Kategorien (from load). */
		anlageGemZeilen?: Record<string, number | null>;
	}

	let {
		members = [],
		projects = [],
		values = {},
		errors = {},
		onDirty,
		anlageGemZeilen = {}
	}: Props = $props();

	function v(key: string): string {
		const raw = values[key];
		return raw == null ? '' : String(raw);
	}

	let spendeKind = $state<SpendeKind>((v('spende_kind') as SpendeKind) || 'geldspende');
	let zweckbindungKind = $state<ZweckbindungKind>(
		(v('zweckbindung_kind') as ZweckbindungKind) || 'zweckfrei'
	);
	let spenderMode = $state<'member' | 'extern'>(v('member_id') ? 'member' : 'extern');
	let selectedMemberId = $state(v('member_id'));
	let zugewendetAm = $state(v('zugewendet_am'));

	// Extern Spender fields backed by local $state + bind:value (mirror
	// selectedMemberId) so typed data SURVIVES a Spender mode toggle (UX-07 §7.2).
	// The inputs live inside an {#if}/{:else} that re-mounts on toggle; as
	// uncontrolled `value={…}` inputs they would reset, losing what the user typed.
	let spenderName = $state(v('spender_name'));
	let spenderAdresse = $state(v('spender_adresse'));
	let spenderEmail = $state(v('spender_email'));

	const isSach = $derived(spendeKind === 'sachspende');
	const isZweckgebunden = $derived(zweckbindungKind === 'zweckgebunden');

	// Anlage-Gem-Zeile for the currently-derived Kategorie (reactive to the
	// Spendenart/Zweckbindung pickers); null degrades gracefully in the badge.
	const derivedKategorieName = $derived(deriveDonationKategorieName(spendeKind, zweckbindungKind));
	const anlageGemZeile = $derived(anlageGemZeilen[derivedKategorieName] ?? null);

	const selectedMember = $derived(members.find((m) => m.id === selectedMemberId));
	// Member address autofill: surface the member's stored Adresse for the receipt.
	const memberAdresse = $derived(selectedMember?.adresse ?? '');

	function markDirty() {
		onDirty?.();
	}

	function err(key: string): string | null {
		return errors[key]?.[0] ?? null;
	}
</script>

<div class="flex flex-col gap-5">
	<!-- 1. Spendenart -->
	<fieldset>
		<legend class="mb-1.5 block text-sm font-medium text-foreground">
			Spendenart <span class="text-red-500" aria-hidden="true">*</span>
		</legend>
		<div class="flex flex-wrap gap-2">
			{#each [['geldspende', 'Geldspende'], ['sachspende', 'Sachspende']] as [k, l] (k)}
				<button
					type="button"
					onclick={() => {
						spendeKind = k as SpendeKind;
						markDirty();
					}}
					class={[
						'inline-flex min-h-11 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
						spendeKind === k
							? 'bg-primary text-primary-foreground'
							: 'bg-muted text-muted-foreground hover:text-foreground'
					].join(' ')}
					data-testid={`spendeart-${k}`}
				>
					{l}
				</button>
			{/each}
			<!-- Aufwand disabled (D9 — Phase 2). -->
			<button
				type="button"
				disabled
				title="Aufwandsspende-Workflow folgt in Phase 2"
				class="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground/50"
				data-testid="spendeart-aufwand-disabled"
			>
				Aufwand
			</button>
		</div>
		<input type="hidden" name="spende_kind" value={spendeKind} />
	</fieldset>

	<!-- 2. Zweckbindung -->
	<fieldset>
		<legend class="mb-1.5 block text-sm font-medium text-foreground">
			Zweckbindung <span class="text-red-500" aria-hidden="true">*</span>
		</legend>
		<div class="flex flex-wrap gap-2">
			{#each [['zweckfrei', 'Zweckfrei'], ['zweckgebunden', 'Zweckgebunden']] as [k, l] (k)}
				<button
					type="button"
					onclick={() => {
						zweckbindungKind = k as ZweckbindungKind;
						markDirty();
					}}
					class={[
						'inline-flex min-h-11 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
						zweckbindungKind === k
							? 'bg-primary text-primary-foreground'
							: 'bg-muted text-muted-foreground hover:text-foreground'
					].join(' ')}
					data-testid={`zweckbindung-${k}`}
				>
					{l}
				</button>
			{/each}
		</div>
		<input type="hidden" name="zweckbindung_kind" value={zweckbindungKind} />

		{#if isZweckgebunden}
			<div class="mt-2 space-y-1">
				<label for="zweckbindung_text" class="block text-sm font-medium text-foreground">
					Zweckbindungs-Text <span class="text-red-500" aria-hidden="true">*</span>
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
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				/>
				{#if err('zweckbindung_text')}
					<p class="text-xs text-red-600">{err('zweckbindung_text')}</p>
				{/if}
			</div>
		{/if}
	</fieldset>

	<!-- Betrag (Sachspende: gemeiner Wert, §9 BewG) -->
	<div>
		<label for="betrag-display" class="mb-1 block text-sm font-medium text-foreground">
			{isSach ? 'Gemeiner Wert (€, § 9 BewG)' : 'Betrag (€)'}
			<span class="text-red-500" aria-hidden="true">*</span>
		</label>
		<div class="relative">
			<span class="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">€</span>
			<input
				id="betrag-display"
				type="number"
				step="0.01"
				min="0.01"
				required
				placeholder="0,00"
				value={v('betragCents') ? String(Number(v('betragCents')) / 100) : ''}
				oninput={(e) => {
					const val = parseFloat((e.target as HTMLInputElement).value) || 0;
					const hidden = document.querySelector<HTMLInputElement>('input[name="betragCents"]');
					if (hidden) hidden.value = String(Math.round(val * 100));
					markDirty();
				}}
				data-testid="betrag-eur-input"
				class="w-full rounded-md border border-border bg-background py-2 pr-3 pl-8 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
			/>
			<input type="hidden" name="betragCents" value={v('betragCents')} />
		</div>
	</div>

	<!-- Zuwendungsdatum -->
	<div class="space-y-1.5">
		<label for="zugewendet_am" class="block text-sm font-medium text-foreground">
			Zuwendungsdatum <span class="text-red-500" aria-hidden="true">*</span>
		</label>
		<DateField
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

	<!-- Projekt (optional, Mittelverwendung) -->
	{#if projects.length}
		<div>
			<label for="project_id" class="mb-1 block text-sm font-medium text-foreground">
				Projekt <span class="text-xs font-normal text-muted-foreground">(optional)</span>
			</label>
			<select
				id="project_id"
				name="project_id"
				value={v('project_id')}
				onchange={markDirty}
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
			>
				<option value="">— kein Projekt —</option>
				{#each projects as p (p.id)}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
		</div>
	{/if}

	<!-- Sachspende Wertermittlung reveal -->
	{#if isSach}
		<fieldset
			class="space-y-3 rounded-md border border-border bg-muted/30 p-3"
			data-testid="sachspende-reveal"
		>
			<legend class="px-1 text-sm font-medium text-foreground">Sachspende — Wertermittlung</legend>

			<div class="space-y-1">
				<label for="wertermittlung_methode" class="block text-sm font-medium text-foreground">
					Wertermittlungsmethode <span class="text-red-500" aria-hidden="true">*</span>
				</label>
				<select
					id="wertermittlung_methode"
					name="wertermittlung_methode"
					value={v('wertermittlung_methode')}
					onchange={markDirty}
					data-testid="wertermittlung-methode"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				>
					<option value="">— wählen —</option>
					<option value="marktpreis">Marktpreis</option>
					<option value="kaufbeleg">Kaufbeleg</option>
					<option value="schaetzung">Schätzung</option>
					<option value="buchwert">Buchwert</option>
				</select>
				{#if err('wertermittlung_methode')}
					<p class="text-xs text-red-600">{err('wertermittlung_methode')}</p>
				{/if}
			</div>

			<div class="space-y-1">
				<label for="zustand_beschreibung" class="block text-sm font-medium text-foreground">
					Beschreibung des Gegenstands (Art, Zustand)
					<span class="text-red-500" aria-hidden="true">*</span>
				</label>
				<textarea
					id="zustand_beschreibung"
					name="zustand_beschreibung"
					rows="2"
					value={v('zustand_beschreibung')}
					oninput={markDirty}
					data-testid="zustand-beschreibung"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				></textarea>
				{#if err('zustand_beschreibung')}
					<p class="text-xs text-red-600">{err('zustand_beschreibung')}</p>
				{/if}
			</div>

			<div class="space-y-1">
				<label for="herkunftsbeleg" class="block text-sm font-medium text-foreground">
					Herkunftsbeleg <span class="text-xs font-normal text-muted-foreground">(optional)</span>
				</label>
				<input
					id="herkunftsbeleg"
					name="herkunftsbeleg"
					type="file"
					accept=".pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
					onchange={markDirty}
					class="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-accent"
				/>
			</div>

			<label class="flex items-center gap-2 text-sm text-foreground">
				<input
					type="checkbox"
					name="betriebsvermoegen"
					value="true"
					checked={v('betriebsvermoegen') === 'true'}
					onchange={markDirty}
					data-testid="betriebsvermoegen"
					class="size-4 rounded border-input"
				/>
				Sachspende aus Betriebsvermögen
			</label>
		</fieldset>
	{:else}
		<!-- Geldspende: optional main Beleg / Kontoauszug (§4.3 — encouraged). -->
		<div class="space-y-1">
			<label for="beleg" class="block text-sm font-medium text-foreground">
				Beleg / Kontoauszug <span class="text-xs font-normal text-muted-foreground">(optional)</span>
			</label>
			<input
				id="beleg"
				name="beleg"
				type="file"
				accept=".pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
				onchange={markDirty}
				class="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-accent"
			/>
		</div>
	{/if}

	<!-- 3. Spender -->
	<fieldset>
		<legend class="mb-1.5 block text-sm font-medium text-foreground">
			Spender <span class="text-red-500" aria-hidden="true">*</span>
		</legend>
		<div class="mb-2 flex flex-wrap gap-2">
			{#each [['member', 'Mitglied'], ['extern', 'Externe Person']] as [k, l] (k)}
				<button
					type="button"
					onclick={() => {
						spenderMode = k as 'member' | 'extern';
						if (k === 'extern') selectedMemberId = '';
						markDirty();
					}}
					class={[
						'inline-flex min-h-11 items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
						spenderMode === k
							? 'bg-primary text-primary-foreground'
							: 'bg-muted text-muted-foreground hover:text-foreground'
					].join(' ')}
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
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
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
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				/>
				{#if err('spender_name')}
					<p class="text-xs text-red-600">{err('spender_name')}</p>
				{/if}
				<input
					name="spender_adresse"
					type="text"
					placeholder="Adresse *"
					bind:value={spenderAdresse}
					oninput={markDirty}
					required
					data-testid="spender-adresse-input"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				/>
				{#if err('spender_adresse')}
					<p class="text-xs text-red-600">{err('spender_adresse')}</p>
				{/if}
				<input
					name="spender_email"
					type="email"
					placeholder="E-Mail (optional)"
					bind:value={spenderEmail}
					oninput={markDirty}
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				/>
			</div>
		{/if}
	</fieldset>

	<!-- Read-only derived-Kategorie badge (NO Kategorie picker). -->
	<DerivedKategorieBadge {spendeKind} {zweckbindungKind} {anlageGemZeile} />
</div>

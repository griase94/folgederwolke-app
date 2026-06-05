<script lang="ts">
	/**
	 * AusgabeFields — the Ausgaben entry fields injected into `EntryFormShell`'s
	 * `fields` snippet (Phase 4, Task 4).
	 *
	 * Owns the bezahlt-von branching + the admin "Schon bezahlt?" reveal. All
	 * descriptive fields (Bezeichnung / Betrag / Kategorie / Rechnungs-/Abfluss-
	 * datum) live OUTSIDE the bezahlt-von panels (UX-07): switching Verein ⇄
	 * Mitglied ⇄ Extern only toggles the recipient panel, it never re-renders or
	 * resets the descriptive inputs. The "Schon bezahlt?" toggle is a reveal
	 * WITHIN the member/extern panel (Zahlungsart + Erstattungsdatum), visually
	 * distinct from the Verein auto-paid notice so the admin can't mode-error.
	 *
	 * Sphäre is derived STRICTLY from the picked Kategorie via KategoriePicker
	 * (§4.5); the server re-derives it inside createExpense, so the inline
	 * SphereBadge here is purely informational. Beleg is the §4.1 gate: a Beleg
	 * file OR an explicit "kein Beleg" + Begründung (BelegUpload owns that reveal).
	 */
	import DateField from '$lib/components/ui/date-field/DateField.svelte';
	import KategoriePicker from '$lib/components/admin/transactions/fields/KategoriePicker.svelte';
	import BelegUpload from '$lib/components/admin/transactions/fields/BelegUpload.svelte';
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

	interface Props {
		members: MemberRow[];
		expenseKategorien: KategorieRow[];
		zahlungsarten: ZahlungsartRow[];
		projects: ProjectRow[];
		defaultKategorie: string;
		prefillProjectId: string | null;
		/** Bubbled up so the page can track dirtiness for the shell footer. */
		onDirty?: () => void;
	}

	let {
		members,
		expenseKategorien,
		zahlungsarten,
		projects,
		defaultKategorie,
		prefillProjectId,
		onDirty,
	}: Props = $props();

	const today = new Date().toISOString().slice(0, 10);

	// ── Descriptive fields (stable across bezahlt-von switches — UX-07) ───────
	// svelte-ignore state_referenced_locally
	let kategorieName = $state(defaultKategorie ?? '');
	// svelte-ignore state_referenced_locally
	let kategorieSphere = $state<Sphere>(
		expenseKategorien.find((k) => k.name === defaultKategorie)?.sphere ?? 'ideeller',
	);
	let rechnungsdatum = $state(today);
	let abflussDatum = $state(today);
	// svelte-ignore state_referenced_locally
	let projectId = $state(prefillProjectId ?? '');

	// ── bezahlt-von branching ─────────────────────────────────────────────────
	let bezahltVonKind = $state<'verein' | 'member' | 'extern'>('verein');
	let selectedMemberId = $state('');

	const selectedMember = $derived(members.find((m) => m.id === selectedMemberId));
	const bezahltVonDisplay = $derived(() => {
		if (bezahltVonKind === 'verein') return 'Folge der Wolke e.V.';
		if (bezahltVonKind === 'member' && selectedMember) {
			return `${selectedMember.vorname} ${selectedMember.nachname}`.trim();
		}
		return '';
	});

	// ── Admin "Schon bezahlt?" reveal (member/extern only) ────────────────────
	let schonBezahlt = $state(false);
	let zahlungsartId = $state('');
	let erstattetAm = $state(today);

	// ── Beleg (kein-Beleg → Begründung reveal lives in BelegUpload) ───────────
	let keinBeleg = $state(false);
	let begruendung = $state('');

	// Betrag is entered as euros in a display input; the canonical integer-cents
	// value is mirrored into a hidden field the server Zod schema parses.
	let betragCents = $state('');

	$effect(() => {
		if (!zahlungsartId && zahlungsarten.length > 0) {
			zahlungsartId = zahlungsarten[0]?.id ?? '';
		}
	});

	function markDirty() {
		onDirty?.();
	}
</script>

<div class="flex flex-col gap-4" oninput={markDirty} onchange={markDirty}>
	<!-- Bezeichnung -->
	<div class="flex flex-col gap-1.5">
		<label for="bezeichnung" class="text-sm font-medium text-foreground">
			Bezeichnung <span class="text-destructive" aria-hidden="true">*</span>
		</label>
		<input
			id="bezeichnung"
			name="bezeichnung"
			type="text"
			required
			maxlength={500}
			placeholder="z.B. Druckerpatronen, Raummiete März"
			class="rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
		/>
	</div>

	<!-- Betrag (native number → hidden cents) -->
	<div class="flex flex-col gap-1.5">
		<label for="betrag-display" class="text-sm font-medium text-foreground">
			Betrag (€) <span class="text-destructive" aria-hidden="true">*</span>
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
				oninput={(e) => {
					const v = parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
					betragCents = String(Math.round(v * 100));
				}}
				class="w-full rounded-md border border-border bg-background py-2 pr-3 pl-8 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
			/>
			<input type="hidden" name="betragCents" value={betragCents} />
		</div>
	</div>

	<!-- Rechnungsdatum + Abfluss-Datum -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="flex flex-col gap-1.5">
			<label for="rechnungsdatum" class="text-sm font-medium text-foreground">
				Rechnungsdatum <span class="text-destructive" aria-hidden="true">*</span>
			</label>
			<DateField
				id="rechnungsdatum"
				name="rechnungsdatum"
				value={rechnungsdatum}
				required
				onchange={(iso) => {
					rechnungsdatum = iso;
					markDirty();
				}}
			/>
		</div>
		<div class="flex flex-col gap-1.5">
			<label for="abfluss_datum" class="text-sm font-medium text-foreground">
				Abfluss-Datum <span class="text-destructive" aria-hidden="true">*</span>
			</label>
			<DateField
				id="abfluss_datum"
				name="abfluss_datum"
				value={abflussDatum}
				required
				onchange={(iso) => {
					abflussDatum = iso;
					markDirty();
				}}
			/>
		</div>
	</div>

	<!-- Kategorie (drives Sphäre strictly, §4.5) + inline SphereBadge -->
	<div class="flex flex-col gap-1.5">
		<label for="kategorie" class="text-sm font-medium text-foreground">
			Kategorie <span class="text-destructive" aria-hidden="true">*</span>
		</label>
		<KategoriePicker
			id="kategorie"
			name="kategorieNameSnapshot"
			required
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
	</div>

	<!-- Projekt (optional) -->
	{#if projects.length > 0}
		<div class="flex flex-col gap-1.5">
			<label for="projectId" class="text-sm font-medium text-foreground">Projekt</label>
			<select
				id="projectId"
				name="projectId"
				bind:value={projectId}
				class="rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
			>
				<option value="">— Kein Projekt —</option>
				{#each projects as p (p.id)}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
		</div>
	{/if}

	<!-- ── Bezahlt von (segmented) ───────────────────────────────────────────── -->
	<fieldset class="flex flex-col gap-2">
		<legend class="text-sm font-medium text-foreground">Bezahlt von</legend>
		<div class="flex gap-2">
			{#each [['verein', 'Verein'], ['member', 'Mitglied'], ['extern', 'Extern']] as [k, l] (k)}
				<button
					type="button"
					onclick={() => {
						bezahltVonKind = k as 'verein' | 'member' | 'extern';
						markDirty();
					}}
					aria-pressed={bezahltVonKind === k}
					data-testid={`bezahlt-von-${k}`}
					class={[
						'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
						bezahltVonKind === k
							? 'bg-primary text-primary-foreground'
							: 'bg-muted text-muted-foreground hover:text-foreground',
					].join(' ')}
				>
					{l}
				</button>
			{/each}
		</div>

		<input type="hidden" name="bezahltVonKind" value={bezahltVonKind} data-testid="bezahlt-von-kind" />
		<input type="hidden" name="bezahltVonDisplay" value={bezahltVonDisplay()} />

		{#if bezahltVonKind === 'verein'}
			<!-- Verein auto-paid panel — visually distinct (calm green note) so it
			     reads differently from the "Schon bezahlt" reveal (avoid mode-error). -->
			<div
				data-testid="verein-autopaid-note"
				class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-200"
			>
				Direkt vom Verein bezahlt — wird sofort als <strong>erstattet</strong> verbucht (Abfluss-Datum
				oben).
			</div>
		{:else if bezahltVonKind === 'member'}
			<select
				name="bezahltVonMemberId"
				bind:value={selectedMemberId}
				class="rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
			>
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
					class="rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				/>
				<input
					name="externIban"
					type="text"
					placeholder="IBAN"
					class="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				/>
				<input
					name="externEmail"
					type="email"
					placeholder="E-Mail (optional)"
					class="rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				/>
			</div>
		{/if}

		<!-- ── Admin "Schon bezahlt?" reveal (member/extern only) ─────────────── -->
		{#if bezahltVonKind !== 'verein'}
			<div class="mt-1 rounded-md border border-border bg-muted/30 px-3 py-2">
				<label class="flex items-center gap-2 text-sm font-medium text-foreground">
					<input
						type="checkbox"
						name="schonBezahlt"
						value="true"
						bind:checked={schonBezahlt}
						onchange={markDirty}
						class="size-4 rounded border-input"
						data-testid="schon-bezahlt-toggle"
					/>
					Schon bezahlt? (Erstattung sofort verbuchen + benachrichtigen)
				</label>

				{#if schonBezahlt}
					<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div class="flex flex-col gap-1.5">
							<label for="zahlungsartId" class="text-sm font-medium text-foreground">
								Zahlungsart <span class="text-destructive" aria-hidden="true">*</span>
							</label>
							<select
								id="zahlungsartId"
								name="zahlungsartId"
								bind:value={zahlungsartId}
								class="rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
							>
								{#each zahlungsarten as z (z.id)}
									<option value={z.id}>{z.label}</option>
								{/each}
							</select>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="erstattetAm" class="text-sm font-medium text-foreground">
								Erstattungsdatum <span class="text-destructive" aria-hidden="true">*</span>
							</label>
							<DateField
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
			<!-- Verein path: send the Abfluss date as the Zahlungsart selector too
			     (optional zahlart for markExpenseAsPaid). A single calm picker. -->
			<div class="flex flex-col gap-1.5">
				<label for="zahlungsartId-verein" class="text-sm font-medium text-foreground">
					Zahlungsart
				</label>
				<select
					id="zahlungsartId-verein"
					name="zahlungsartId"
					bind:value={zahlungsartId}
					class="rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				>
					<option value="">— Keine —</option>
					{#each zahlungsarten as z (z.id)}
						<option value={z.id}>{z.label}</option>
					{/each}
				</select>
			</div>
		{/if}
	</fieldset>

	<!-- ── Beleg (§4.1 gate: file OR kein-Beleg + Begründung) ─────────────────── -->
	<BelegUpload bind:keinBeleg bind:begruendung />
</div>

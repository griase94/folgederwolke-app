<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type TransactionType = 'expense' | 'income' | 'donation';

	// C7-1 — initialType comes from ?kind=… (mapped from German URL slug to
	// the English domain enum in +page.server.ts via parseKindFromUrl).
	// Defaults to 'expense' when no query param is present.
	// svelte-ignore state_referenced_locally
	let selectedType = $state<TransactionType>(data.initialType ?? 'expense');
	let submitting = $state(false);

	const typeLabels: Record<TransactionType, string> = {
		expense: 'Ausgabe',
		income: 'Einnahme',
		donation: 'Spende',
	};

	// Kategorie picker (VB-004 + JB-014 fix — no more hidden "(Unkategorisiert)").
	// The form starts on the smart-default kategorie name. Sphere is derived
	// from the picked kategorie via a server-side re-resolution in +page.server.ts.
	// svelte-ignore state_referenced_locally
	let expenseKategorieName = $state<string>(data.defaultExpenseKategorie ?? '');
	// svelte-ignore state_referenced_locally
	let incomeKategorieName = $state<string>(data.defaultIncomeKategorie ?? '');

	// BezahltVon state (expense only)
	// C2-TAX: default flips 'member' → 'verein' for the admin direct ausgabe
	// path (the public Auslage form is the right entry point for Mitglied-paid
	// expenses; admin direct entry is almost always Verein-paid).
	// svelte-ignore state_referenced_locally
	let bezahltVonKind = $state<'verein' | 'member' | 'extern'>(
		(data.initialType ?? 'expense') === 'expense' ? 'verein' : 'member'
	);
	let selectedMemberId = $state('');

	// C2-TAX: Abfluss-Datum (cash-out) state for kind=ausgabe — required per
	// EÜR §11 EStG. Default to today (Berlin TZ) for ergonomic input. Maps
	// to the existing `expenses.abfluss_datum` column (cycle 2 consolidation).
	let abflussDatum = $state(new Date().toISOString().split('T')[0]!);

	// C2-TAX: Beleg file state for kind=ausgabe — required.
	let belegFile = $state<File | null>(null);

	// C1-PRJ-A: project picker state. `?projectId=` from ProjectCtaRail
	// deep-links land here pre-selected so the user doesn't re-pick.
	// svelte-ignore state_referenced_locally
	let projectId = $state<string>(data.prefillProjectId ?? '');

	const selectedMember = $derived(
		data.members.find((m) => m.id === selectedMemberId),
	);

	const bezahltVonDisplay = $derived(() => {
		if (bezahltVonKind === 'verein') return 'Folge der Wolke e.V.';
		if (bezahltVonKind === 'member' && selectedMember) {
			return `${selectedMember.vorname} ${selectedMember.nachname}`.trim();
		}
		return '';
	});

	const activeKategorieName = $derived(
		selectedType === 'income' ? incomeKategorieName : expenseKategorieName,
	);

	// Sphere preview from the kategorie list — purely informational, server is
	// the truth source (re-resolves on POST in case of tampered body).
	const activeSphere = $derived.by(() => {
		if (selectedType === 'donation') return 'ideeller';
		const list =
			selectedType === 'income' ? data.incomeKategorien : data.expenseKategorien;
		const match = list.find((k) => k.name === activeKategorieName);
		return match?.sphere ?? 'ideeller';
	});

	const sphereLabels: Record<string, string> = {
		ideeller: 'Ideeller Bereich',
		vermoegen: 'Vermögensverwaltung',
		zweckbetrieb: 'Zweckbetrieb',
		wirtschaftlich: 'Wirtschaftlicher GB',
	};

	// ── beforeNavigate dirty-check (P1-B1) ────────────────────────────────
	// Most fields on this page are uncontrolled native inputs (not bound to
	// $state), so we snapshot at mount-time by serialising every input/
	// textarea/select value inside the form, then compare against the same
	// at navigate-away time. Cheap and covers all field types.
	let formEl: HTMLFormElement | null = $state(null);
	let pristineSnapshot = '';

	function snapshotForm(): string {
		if (!formEl) return '';
		const parts: string[] = [];
		const inputs = formEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
			'input, textarea, select',
		);
		inputs.forEach((el) => {
			parts.push(`${el.name}=${el.value}`);
		});
		// Include reactive $state vars (button-driven, not in formEl as inputs)
		parts.push(`__selectedType=${selectedType}`);
		parts.push(`__bezahltVonKind=${bezahltVonKind}`);
		return parts.join('|');
	}

	onMount(() => {
		// Wait a tick for the form to mount fully (selectedType / fields render)
		queueMicrotask(() => {
			pristineSnapshot = snapshotForm();
		});
	});

	beforeNavigate(({ cancel, to, type }) => {
		if (submitting) return;
		if (type === 'form' || type === 'leave') return;
		if (to?.url.pathname === window.location.pathname) return;

		if (snapshotForm() === pristineSnapshot) return;

		const confirmed = window.confirm(
			'Änderungen gehen verloren. Trotzdem die Seite verlassen?',
		);
		if (!confirmed) cancel();
	});
</script>

<svelte:head>
	<title>Neue Transaktion – Folge der Wolke</title>
</svelte:head>

<div class="container mx-auto max-w-2xl px-4 py-8 sm:px-6">
	<!-- ── Breadcrumb ──────────────────────────────────────────────────────── -->
	<nav class="mb-6 flex items-center gap-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/transactions" class="hover:text-foreground">Transaktionen</a>
		<span aria-hidden="true">›</span>
		<span class="text-foreground font-medium">Neue Transaktion</span>
	</nav>

	<div class="rounded-xl border border-border bg-background p-6 shadow-sm">
		<h1 class="mb-6 text-xl font-bold text-foreground">Neue Transaktion erfassen</h1>

		<!-- ── Type picker ─────────────────────────────────────────────────── -->
		<div class="mb-6">
			<p class="mb-2 text-sm font-medium text-foreground">Typ</p>
			<div class="flex gap-2">
				{#each Object.entries(typeLabels) as [t, label] (t)}
					<button
						type="button"
						onclick={() => (selectedType = t as TransactionType)}
						class={[
							'rounded-md px-4 py-2 text-sm font-medium transition-colors',
							selectedType === t
								? 'bg-primary text-primary-foreground shadow-sm'
								: 'bg-muted text-muted-foreground hover:text-foreground',
						].join(' ')}
						aria-pressed={selectedType === t}
					>
						{label}
					</button>
				{/each}
			</div>
		</div>

		{#if form?.error}
			<div class="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
				{form.error}
			</div>
		{/if}

		<!-- ── Form ────────────────────────────────────────────────────────── -->
		<!-- C2-TAX: enctype=multipart/form-data so the Beleg file field is parsed
		     correctly server-side. -->
		<form
			bind:this={formEl}
			method="POST"
			action="?/create"
			enctype="multipart/form-data"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<input type="hidden" name="type" value={selectedType} />

			<!-- Bezeichnung -->
			<div>
				<label for="bezeichnung" class="mb-1 block text-sm font-medium text-foreground">
					Bezeichnung <span class="text-red-500" aria-hidden="true">*</span>
				</label>
				<input
					id="bezeichnung"
					name="bezeichnung"
					type="text"
					required
					maxlength={500}
					placeholder="z.B. Druckerpatronen, Raummiete März"
					class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				/>
			</div>

			<!-- Betrag -->
			<div>
				<label for="betragCents-display" class="mb-1 block text-sm font-medium text-foreground">
					Betrag (€) <span class="text-red-500" aria-hidden="true">*</span>
				</label>
				<div class="relative">
					<span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
					<input
						id="betragCents-display"
						type="number"
						step="0.01"
						min="0.01"
						required
						placeholder="0,00"
						oninput={(e) => {
							const v = parseFloat((e.target as HTMLInputElement).value) || 0;
							const hidden = document.querySelector<HTMLInputElement>('input[name="betragCents"]');
							if (hidden) hidden.value = String(Math.round(v * 100));
						}}
						class="w-full rounded-md border border-border bg-background py-2 pr-3 pl-8 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
					<input type="hidden" name="betragCents" value="" />
				</div>
			</div>

			<!-- Expense-specific fields -->
			{#if selectedType === 'expense'}
				<div class="space-y-1.5">
					<label for="rechnungsdatum" class="block text-sm font-medium text-foreground">
						Rechnungsdatum <span class="text-red-500" aria-hidden="true">*</span>
					</label>
					<input
						id="rechnungsdatum"
						name="rechnungsdatum"
						type="date"
						lang="de"
						required
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
				</div>

				<!-- C2-TAX: Abfluss-Datum — required per EÜR §11 EStG. Maps to the
				     existing `expenses.abfluss_datum` column. -->
				<div class="space-y-1.5">
					<label for="abfluss_datum" class="block text-sm font-medium text-foreground">
						Abfluss-Datum <span class="text-red-500" aria-hidden="true">*</span>
					</label>
					<p class="text-muted-foreground text-xs">Tag, an dem das Geld tatsächlich abgeflossen ist.</p>
					<input
						id="abfluss_datum"
						name="abfluss_datum"
						type="date"
						lang="de"
						required
						bind:value={abflussDatum}
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
				</div>

				<!-- C2-TAX: Beleg upload — required for kind=ausgabe. The native
				     file input is enough here (the public Auslage form uses the
				     BelegUpload composite for client-side compress + preview; the
				     admin direct path is faster without that overhead). -->
				<div class="space-y-1.5">
					<label for="beleg" class="block text-sm font-medium text-foreground">
						Beleg <span class="text-red-500" aria-hidden="true">*</span>
					</label>
					<p class="text-muted-foreground text-xs">PDF, JPEG, PNG, HEIC, WebP — max. 10 MB.</p>
					<input
						id="beleg"
						name="beleg"
						type="file"
						accept=".pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
						required
						onchange={(e) => {
							const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
							belegFile = f;
						}}
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
					{#if belegFile}
						<p class="text-muted-foreground text-xs">Ausgewählt: {belegFile.name}</p>
					{/if}
				</div>

				<!-- BezahltVon -->
				<div>
					<p class="mb-2 text-sm font-medium text-foreground">Bezahlt von</p>
					<div class="flex gap-2 mb-3">
						{#each [['verein', 'Verein'], ['member', 'Mitglied'], ['extern', 'Extern']] as [k, l] (k)}
							<button
								type="button"
								onclick={() => (bezahltVonKind = k as 'verein' | 'member' | 'extern')}
								class={[
									'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
									bezahltVonKind === k
										? 'bg-primary text-primary-foreground'
										: 'bg-muted text-muted-foreground hover:text-foreground',
								].join(' ')}
								data-testid={`bezahlt-von-${k}`}
							>
								{l}
							</button>
						{/each}
					</div>

					<!-- C2-TAX: data-testid on the hidden input so e2e tests can read
					     the active bezahltVonKind value programmatically. -->
					<input
						type="hidden"
						name="bezahltVonKind"
						value={bezahltVonKind}
						data-testid="bezahlt-von-kind"
					/>
					<input type="hidden" name="bezahltVonDisplay" value={bezahltVonDisplay()} />

					{#if bezahltVonKind === 'member'}
						<select
							name="bezahltVonMemberId"
							bind:value={selectedMemberId}
							class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
						>
							<option value="">Mitglied auswählen…</option>
							{#each data.members as m (m.id)}
								<option value={m.id}>{m.nachname}, {m.vorname}</option>
							{/each}
						</select>
					{:else if bezahltVonKind === 'extern'}
						<div class="space-y-2">
							<input
								name="externName"
								type="text"
								placeholder="Name"
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
							/>
							<input
								name="externIban"
								type="text"
								placeholder="IBAN"
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary focus:outline-none"
							/>
							<input
								name="externEmail"
								type="email"
								placeholder="E-Mail (optional)"
								class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
							/>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Income-specific -->
			{#if selectedType === 'income'}
				<div>
					<label for="geldEingangDatum" class="mb-1 block text-sm font-medium text-foreground">Geldeingangsdatum</label>
					<input
						id="geldEingangDatum"
						name="geldEingangDatum"
						type="date"
						lang="de"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
				</div>
			{/if}

			<!-- Kategorie picker (VB-004 + JB-014: tax-correctness gate) -->
			{#if selectedType !== 'donation'}
				<div>
					<label
						for="kategorieNameSnapshot"
						class="mb-1 block text-sm font-medium text-foreground"
					>
						Kategorie <span class="text-red-500" aria-hidden="true">*</span>
					</label>
					{#if selectedType === 'expense'}
						<select
							id="kategorieNameSnapshot"
							name="kategorieNameSnapshot"
							required
							bind:value={expenseKategorieName}
							class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
							data-testid="kategorie-picker-expense"
						>
							{#if data.expenseKategorien.length === 0}
								<option value="" disabled>(Keine Kategorien — bitte zuerst seeden)</option>
							{/if}
							{#each data.expenseKategorien as k (k.id)}
								<option value={k.name}>{k.name}</option>
							{/each}
						</select>
					{:else}
						<select
							id="kategorieNameSnapshot"
							name="kategorieNameSnapshot"
							required
							bind:value={incomeKategorieName}
							class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
							data-testid="kategorie-picker-income"
						>
							{#if data.incomeKategorien.length === 0}
								<option value="" disabled>(Keine Kategorien — bitte zuerst seeden)</option>
							{/if}
							{#each data.incomeKategorien as k (k.id)}
								<option value={k.name}>{k.name}</option>
							{/each}
						</select>
					{/if}
					<p class="mt-1 text-xs text-muted-foreground" data-testid="sphere-preview">
						Sphäre: <span class="font-medium text-foreground">{sphereLabels[activeSphere]}</span>
						<span class="ml-1">(automatisch aus Kategorie)</span>
					</p>
					<input type="hidden" name="sphereSnapshot" value={activeSphere} />
				</div>

				<!-- C1-PRJ-A: project picker (optional). Pre-fills from the
				     `?projectId=` URL param when launched from ProjectCtaRail
				     (+Einnahme / +Ausgabe CTAs on the project detail hero). -->
				<div>
					<label for="projectId" class="mb-1 block text-sm font-medium text-foreground">
						Projekt (optional)
					</label>
					<select
						id="projectId"
						name="projectId"
						bind:value={projectId}
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
						data-testid="transaction-project-picker"
					>
						<option value="">— Kein Projekt —</option>
						{#each data.projects as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<!-- Donation-specific -->
			{#if selectedType === 'donation'}
				<div>
					<label for="spenderName" class="mb-1 block text-sm font-medium text-foreground">Spender</label>
					<input
						id="spenderName"
						name="spenderName"
						type="text"
						placeholder="Name des Spenders"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
				</div>
				<div>
					<label for="zugewendetAm" class="mb-1 block text-sm font-medium text-foreground">Zugewendet am</label>
					<input
						id="zugewendetAm"
						name="zugewendetAm"
						type="date"
						lang="de"
						class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
					/>
				</div>

				<!-- Kategorie snapshot (hidden default for now) -->
				<input type="hidden" name="kategorieNameSnapshot" value="Spende" />
				<input type="hidden" name="spendeKind" value="geldspende" />
				<input type="hidden" name="zweckbindungKind" value="zweckfrei" />
			{/if}

			<!-- Kommentar -->
			<div>
				<label for="kommentar" class="mb-1 block text-sm font-medium text-foreground">Kommentar</label>
				<textarea
					id="kommentar"
					name="kommentar"
					rows="2"
					maxlength={2000}
					class="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
				></textarea>
			</div>

			<!-- Donation-only fallback snapshot — kept separate from the
			     expense/income Kategorie picker above (which now drives
			     sphereSnapshot via the picker). -->
			{#if selectedType === 'donation'}
				<input type="hidden" name="sphereSnapshot" value="ideeller" />
			{/if}

			<!-- Actions -->
			<div class="flex gap-3 pt-2">
				<button
					type="submit"
					disabled={submitting}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
				>
					{submitting ? 'Speichere…' : `${typeLabels[selectedType]} erfassen`}
				</button>
				<Button href="/app/transactions" variant="ghost" size="sm">Abbrechen</Button>
			</div>
		</form>
	</div>
</div>

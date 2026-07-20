<!--
  InvoiceForm — the create/edit-invoice form on /app/rechnungen/new and
  /app/rechnungen/[id]/edit (Aurora rechnungen-form-v2 plate).

  Anatomy: LEFT a `.workbench`-style form split into 4 numbered sections
  (Wer bekommt sie? · Eckdaten · Was steht drauf? · Zuordnung) + a footer
  (id-chip + CTA); RIGHT a sticky live real-PDF preview (debounced 500ms via
  InvoicePdfPreview → POST /api/rechnungen/preview). Mobile collapses to a
  single column behind a "Formular / Vorschau" segmented toggle.

  This PR ships the SINGLE-LINE position (one Bezeichnung + one Betrag) —
  the 1..n position editor is a later PR (brief §6.1, E1 default (b)).

  Submit posts to `submitAction` (default `?/create`) which:
    1. Validates input
    2. Allocates an FDW-{year}-{NNN} business id
    3. Inserts invoices + invoice_jobs rows
    4. Fires the async PDF generation
    5. Redirects to /app/rechnungen/{id} with ?job={jobId} so the detail
       page can poll for completion.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { cn } from '$lib/utils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DateField from '$lib/components/ui/date-field/DateField.svelte';
	import AddCustomerDialog from '$lib/components/admin/customers/AddCustomerDialog.svelte';
	import InvoicePdfPreview from './InvoicePdfPreview.svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import { parseBetragCents } from '$lib/client/parse-betrag.js';
	import { FIELD_CLASS } from '$lib/components/admin/transactions/fields/field-class.js';
	// Betrag "hero" anatomy (F1 shared primitive, Kit anatomy signature
	// element) — same tokens the entry-modals Betrag field is built from.
	// We compose these directly (rather than the AmountField component)
	// because the b1 e2e contract requires the VISIBLE input to carry
	// name="nettoEur" holding the de-DE euro string; AmountField's `name`
	// lives on a hidden cents input instead.
	import {
		HERO_WRAP,
		HERO_WRAP_ERROR,
		HERO_PREFIX,
		HERO_INPUT,
		HERO_SUFFIX
	} from '$lib/components/ui/hero-field/hero-field-class.js';

	type CustomerOpt = { id: string; name: string; addressBlock: string | null; country?: string };
	type KategorieOpt = { id: string; name: string };
	type ProjectOpt = { id: string; name: string };

	// Aurora field baseline (h-11/rounded-[10px]/border-hairline/bg-card) with
	// text-base on mobile → sm:text-sm on desktop, so inputs never trigger the
	// iOS auto-zoom-on-focus (< 16px) — same pattern as the kunden/rechnungen
	// list search inputs.
	const FIELD = FIELD_CLASS.replace('text-sm', 'text-base sm:text-sm');

	let {
		customers,
		kategorien,
		projects,
		invoiceNumberPreview,
		initial,
		errors = {},
		// Phase 12-B: optional overrides for the edit route. Default values
		// preserve the /new behaviour exactly — the create route doesn't pass
		// these.
		submitAction = '?/create',
		submitLabel = 'Rechnung erstellen & PDF',
		submitLabelPending = 'Wird erstellt …',
		// Aurora E2: footer "Abbrechen" + top-of-page back link destination.
		cancelHref = '/app/rechnungen'
	}: {
		customers: CustomerOpt[];
		kategorien: KategorieOpt[];
		projects: ProjectOpt[];
		invoiceNumberPreview: string;
		initial: {
			customerId: string;
			kategorieId: string;
			projectId: string;
			rechnungsdatum: string;
			leistungsDatum: string;
			faelligkeitsDatum: string;
			leistungszeitraum: string;
			bezeichnung: string;
			leistungsBeschreibung: string;
			nettoEur: string;
		};
		errors?: Record<string, string[]>;
		submitAction?: string;
		submitLabel?: string;
		submitLabelPending?: string;
		cancelHref?: string;
	} = $props();

	let customerId = $state('');
	let kategorieId = $state('');
	let projectId = $state('');
	let rechnungsdatum = $state('');
	let leistungsDatum = $state('');
	let faelligkeitsDatum = $state('');
	let leistungszeitraum = $state('');
	let bezeichnung = $state('');
	let leistungsBeschreibung = $state('');
	let nettoEur = $state('');

	// One-shot hydration of form state from props. The previous unconditional
	// $effect (no guard) re-ran on every reactive update and overwrote whatever
	// the user had typed back to `initial`. We hydrate exactly once on first
	// run; subsequent `initial` changes are ignored unless the route remounts.
	let hydrated = false;
	$effect(() => {
		if (hydrated) return;
		hydrated = true;
		customerId = initial.customerId;
		kategorieId = initial.kategorieId;
		projectId = initial.projectId;
		rechnungsdatum = initial.rechnungsdatum;
		leistungsDatum = initial.leistungsDatum;
		faelligkeitsDatum = initial.faelligkeitsDatum;
		leistungszeitraum = initial.leistungszeitraum;
		bezeichnung = initial.bezeichnung;
		leistungsBeschreibung = initial.leistungsBeschreibung;
		nettoEur = initial.nettoEur;
	});

	let submitting = $state(false);

	// ── Quick-Add-Kunde (Aurora E2 DELTA §6.2) ────────────────────────────
	// Reuses the existing kit-modal AddCustomerDialog (already wired for this
	// exact "onSuccess selects the new customer" context, see its own doc
	// comment). The route's `?/add` action mirrors /app/kunden's `add` action.
	let quickAddOpen = $state(false);

	// ── Mobile Formular/Vorschau toggle (brief §1, §3, §7.10) ─────────────
	// Both panels stay mounted (display:none via `hidden`), so toggling never
	// re-fetches or drops the debounced preview's in-flight blob state.
	let mobileView = $state<'formular' | 'vorschau'>('formular');

	// ── beforeNavigate dirty-check (P1-B1) ────────────────────────────────
	// Snapshot the form state once mounted; on subsequent attempts to leave
	// the page, compare against current state and ask for confirmation if
	// dirty. Skipped on form submit + leave-app (those have their own UX).
	let pristineSnapshot = '';

	function snapshotState(): string {
		return JSON.stringify({
			customerId,
			kategorieId,
			projectId,
			rechnungsdatum,
			leistungsDatum,
			faelligkeitsDatum,
			leistungszeitraum,
			bezeichnung,
			leistungsBeschreibung,
			nettoEur
		});
	}

	onMount(() => {
		pristineSnapshot = snapshotState();
	});

	beforeNavigate(({ cancel, to, type }) => {
		if (submitting) return;
		// Skip on form-submit redirect and on tab-close / full reload — those
		// have separate UX (beforeunload covers tab-close if we ever add it).
		if (type === 'form' || type === 'leave') return;
		// Same-URL anchor/query updates don't count as navigation-away.
		if (to?.url.pathname === window.location.pathname) return;

		if (snapshotState() === pristineSnapshot) return;

		const confirmed = window.confirm(
			'Änderungen gehen verloren. Trotzdem die Seite verlassen?'
		);
		if (!confirmed) cancel();
	});

	const selectedCustomer = $derived(customers.find((c) => c.id === customerId) ?? null);
	const nettoCents = $derived(parseEur(nettoEur));

	function parseEur(s: string): number {
		// Canonical de-DE/English parser (F24). The bespoke version stripped
		// every dot, destroying dot-decimals ("12.34" → 1234,00 €). Preview only:
		// fall back to 0 on empty/invalid so the live PDF preview stays clean —
		// the server (parseEuroToCents) is authoritative for the stored amount.
		const cents = parseBetragCents(s);
		return Number.isFinite(cents) && cents > 0 ? cents : 0;
	}

	const previewInput = $derived({
		customerId,
		customerName: selectedCustomer?.name ?? '',
		customerAddressBlock: selectedCustomer?.addressBlock ?? null,
		customerCountry: selectedCustomer?.country ?? 'DE',
		rechnungsdatum,
		leistungsDatum: leistungsDatum || null,
		faelligkeitsDatum: faelligkeitsDatum || null,
		leistungszeitraum: leistungszeitraum || null,
		bezeichnung,
		leistungsBeschreibung: leistungsBeschreibung || null,
		nettoCents,
		currency: 'EUR'
	});

	function fieldError(field: string): string | null {
		return errors[field]?.[0] ?? null;
	}

	// ── CTA gate (color doctrine: disabled = flat neutral, NEVER a
	// half-transparent brand-pink) ────────────────────────────────────────
	const gateMissing = $derived(
		[
			!customerId ? 'Kund:in wählen' : null,
			nettoCents <= 0 ? 'Betrag eintragen' : null,
			!kategorieId ? 'Kategorie wählen' : null
		].filter((m): m is string => m !== null)
	);
	const gateDisabled = $derived(gateMissing.length > 0);
	const ctaDisabled = $derived(submitting || gateDisabled);
</script>

{#snippet sectionHeader(n: number, title: string)}
	<div class="mb-3.5 flex items-center gap-2.5 border-b border-hairline pb-2.5">
		<span
			class="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-secondary text-[11.5px] font-bold text-ink-700"
			>{n}</span
		>
		<span class="text-[13px] font-extrabold tracking-[-0.01em] text-ink-900">{title}</span>
	</div>
{/snippet}

<!-- Calendar-icon affordance shared by the Eckdaten date trio (Kit anatomy). -->
{#snippet calendarGlyph()}
	<svg
		class="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-400"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		stroke-width="2"
		aria-hidden="true"
	>
		<rect x="3" y="4" width="18" height="18" rx="2" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M16 2v4M8 2v4M3 10h18" />
	</svg>
{/snippet}

<!-- Mobile-only segmented toggle -->
<div class="mb-4 lg:hidden">
	<div role="tablist" aria-label="Formular oder Vorschau anzeigen" class="flex gap-1 rounded-lg border border-hairline bg-secondary p-1">
		<button
			type="button"
			role="tab"
			aria-selected={mobileView === 'formular'}
			onclick={() => (mobileView = 'formular')}
			class={cn(
				'flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
				mobileView === 'formular' ? 'bg-card text-ink-900 shadow-sm' : 'text-ink-500'
			)}
		>
			Formular
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={mobileView === 'vorschau'}
			onclick={() => (mobileView = 'vorschau')}
			class={cn(
				'flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors',
				mobileView === 'vorschau' ? 'bg-card text-ink-900 shadow-sm' : 'text-ink-500'
			)}
		>
			Vorschau
		</button>
	</div>
</div>

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
	<!-- ── Form ───────────────────────────────────────────────────────── -->
	<form
		method="POST"
		action={submitAction}
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
		class={cn('flex flex-col gap-5', mobileView === 'vorschau' ? 'hidden lg:flex' : '')}
	>
		<!-- 1 · Wer bekommt sie? -->
		<div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
			{@render sectionHeader(1, 'Wer bekommt sie?')}
			<div class="flex items-end gap-2">
				<div class="min-w-0 flex-1">
					<label for="customerId" class="mb-1 block text-[13px] font-semibold text-ink-700"
						>Kund:in <span class="text-primary-text">*</span></label
					>
					<select
						id="customerId"
						name="customerId"
						bind:value={customerId}
						required
						aria-invalid={fieldError('customerId') ? 'true' : undefined}
						class={FIELD}
					>
						<option value="">— Kund:in wählen —</option>
						{#each customers as c (c.id)}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
					{#if fieldError('customerId')}
						<p class="mt-1 text-xs font-medium text-severity-critical-text">{fieldError('customerId')}</p>
					{/if}
				</div>
				<Button
					type="button"
					variant="ghost"
					data-testid="invoice-quick-add-customer"
					onclick={() => (quickAddOpen = true)}
					class="h-11 shrink-0"
				>
					<svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<path stroke-linecap="round" stroke-linejoin="round" d="M2 21v-2a4 4 0 014-4h5a4 4 0 014 4v2M9 7a4 4 0 108 0 4 4 0 00-8 0zM19 8v6M22 11h-6" />
					</svg>
					Neu
				</Button>
			</div>
		</div>

		<!-- 2 · Eckdaten -->
		<div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
			{@render sectionHeader(2, 'Eckdaten')}
			<div class="flex flex-col gap-3.5">
				<div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
					<div>
						<label for="rechnungsdatum" class="mb-1 block text-[13px] font-semibold text-ink-700"
							>Rechnungsdatum <span class="text-primary-text">*</span></label
						>
						<div class="date-wrap relative">
							{@render calendarGlyph()}
							<DateField
								id="rechnungsdatum"
								name="rechnungsdatum"
								value={rechnungsdatum}
								required
								onchange={(iso) => (rechnungsdatum = iso)}
								class="pl-9 text-base sm:text-sm"
							/>
						</div>
					</div>
					<div>
						<label for="leistungsDatum" class="mb-1 block text-[13px] font-semibold text-ink-700"
							>Leistungsdatum</label
						>
						<div class="date-wrap relative">
							{@render calendarGlyph()}
							<DateField
								id="leistungsDatum"
								name="leistungsDatum"
								value={leistungsDatum}
								onchange={(iso) => (leistungsDatum = iso)}
								class="pl-9 text-base sm:text-sm"
							/>
						</div>
					</div>
				</div>

				<div>
					<label for="faelligkeitsDatum" class="mb-1 block text-[13px] font-semibold text-ink-700"
						>Fällig bis</label
					>
					<div class="date-wrap relative">
						{@render calendarGlyph()}
						<DateField
							id="faelligkeitsDatum"
							name="faelligkeitsDatum"
							value={faelligkeitsDatum}
							onchange={(iso) => (faelligkeitsDatum = iso)}
							class="pl-9 text-base sm:text-sm"
						/>
					</div>
					<p class="mt-1 text-xs text-ink-500">
						Leer = ohne Zahlungsziel; überfällig gibt's nur mit Datum.
					</p>
				</div>

				<div>
					<label for="leistungszeitraum" class="mb-1 block text-[13px] font-semibold text-ink-700"
						>Leistungszeitraum <span class="text-primary-text">*</span></label
					>
					<input
						type="text"
						id="leistungszeitraum"
						name="leistungszeitraum"
						bind:value={leistungszeitraum}
						minlength="3"
						maxlength="200"
						required
						placeholder="z. B. „Februar 2026"
						aria-invalid={fieldError('leistungszeitraum') ? 'true' : undefined}
						class={FIELD}
					/>
					<p class="mt-1 text-xs text-ink-500">
						Pflicht nach § 14 Abs. 4 Nr. 6 UStG — z.&nbsp;B. „Februar 2026" oder „Leistungsdatum entspricht Rechnungsdatum".
					</p>
					{#if fieldError('leistungszeitraum')}
						<p class="mt-1 text-xs font-medium text-severity-critical-text">{fieldError('leistungszeitraum')}</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- 3 · Was steht drauf? (single-line position — the 1..n editor is a later PR) -->
		<div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
			{@render sectionHeader(3, 'Was steht drauf?')}

			<div class="rounded-[10px] border border-hairline">
				<div class="flex flex-col gap-3.5 p-3.5 sm:flex-row sm:items-start">
					<div class="min-w-0 flex-1">
						<label for="bezeichnung" class="mb-1 block text-[13px] font-semibold text-ink-700"
							>Bezeichnung <span class="text-primary-text">*</span></label
						>
						<input
							type="text"
							id="bezeichnung"
							name="bezeichnung"
							bind:value={bezeichnung}
							required
							minlength="5"
							maxlength="200"
							placeholder="z. B. Auftritt 12.05.2026"
							aria-invalid={fieldError('bezeichnung') ? 'true' : undefined}
							class={FIELD}
						/>
						{#if fieldError('bezeichnung')}
							<p class="mt-1 text-xs font-medium text-severity-critical-text">{fieldError('bezeichnung')}</p>
						{/if}
					</div>
					<div class="sm:w-[200px] sm:shrink-0">
						<label for="nettoEur" class="mb-1 block text-[13px] font-semibold text-ink-700"
							>Betrag <span class="text-primary-text">*</span></label
						>
						<div
							class={cn(HERO_WRAP, fieldError('nettoCents') && HERO_WRAP_ERROR)}
							style="--hero-accent: var(--type-einnahme)"
							data-testid="invoice-betrag-hero"
						>
							<span
								class={cn(HERO_PREFIX, 'text-[21px] font-semibold leading-none')}
								aria-hidden="true">+</span
							>
							<input
								type="text"
								inputmode="decimal"
								id="nettoEur"
								name="nettoEur"
								bind:value={nettoEur}
								required
								placeholder="0,00"
								aria-invalid={fieldError('nettoCents') ? 'true' : undefined}
								class={cn(HERO_INPUT, 'text-[color:var(--hero-accent)]')}
							/>
							<span class={HERO_SUFFIX} aria-hidden="true">€</span>
						</div>
						{#if fieldError('nettoCents')}
							<p class="mt-1 text-xs font-medium text-severity-critical-text">{fieldError('nettoCents')}</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Summenzeile — Netto = Brutto (§ 19 UStG Kleinunternehmerregelung) -->
			<div class="ml-auto mt-3.5 w-full max-w-[280px]" aria-live="polite">
				<div class="flex flex-col gap-1 text-sm">
					<div class="flex items-center justify-between">
						<span class="text-ink-500">Netto</span>
						<span class="tabular-nums text-ink-700">{formatMoney(nettoCents)}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-ink-500">USt <span class="text-[11px]">(§ 19 UStG)</span></span>
						<span class="tabular-nums text-ink-700">{formatMoney(0)}</span>
					</div>
					<div class="flex items-center justify-between border-t border-hairline pt-1 font-bold">
						<span class="text-ink-900">Gesamtbetrag</span>
						<span class="tabular-nums text-type-einnahme">{formatMoney(nettoCents)}</span>
					</div>
				</div>
			</div>

			<div class="mt-4">
				<label for="leistungsBeschreibung" class="mb-1 block text-[13px] font-semibold text-ink-700"
					>Leistungsbeschreibung (optional)</label
				>
				<textarea
					id="leistungsBeschreibung"
					name="leistungsBeschreibung"
					bind:value={leistungsBeschreibung}
					maxlength="2000"
					rows="3"
					class={cn(FIELD, 'h-auto min-h-24 resize-y py-2.5')}
				></textarea>
			</div>
		</div>

		<!-- 4 · Zuordnung -->
		<div class="rounded-2xl border border-border bg-card p-5 shadow-sm">
			{@render sectionHeader(4, 'Zuordnung')}
			<div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
				<div>
					<label for="kategorieId" class="mb-1 block text-[13px] font-semibold text-ink-700"
						>Kategorie</label
					>
					<select
						id="kategorieId"
						name="kategorieId"
						bind:value={kategorieId}
						required
						aria-invalid={fieldError('kategorieId') ? 'true' : undefined}
						class={FIELD}
					>
						<option value="" disabled>Kategorie wählen …</option>
						{#each kategorien as k (k.id)}
							<option value={k.id}>{k.name}</option>
						{/each}
					</select>
					{#if fieldError('kategorieId')}
						<p class="mt-1 text-xs font-medium text-severity-critical-text">{fieldError('kategorieId')}</p>
					{/if}
				</div>
				<div>
					<label for="projectId" class="mb-1 block text-[13px] font-semibold text-ink-700"
						>Projekt (optional)</label
					>
					<select id="projectId" name="projectId" bind:value={projectId} class={FIELD}>
						<option value="">—</option>
						{#each projects as p (p.id)}
							<option value={p.id}>{p.name}</option>
						{/each}
					</select>
				</div>
			</div>
		</div>

		<!-- Footer: id-chip + Abbrechen/CTA — sticky full-width on mobile -->
		<div
			class="sticky bottom-0 z-10 -mx-4 flex flex-col flex-wrap gap-3 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:gap-4 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none"
		>
			<span class="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-ink-500">
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z" /><path stroke-linecap="round" stroke-linejoin="round" d="M14 2v4a2 2 0 002 2h4M10 9H8m8 4H8m8 4H8" />
				</svg>
				Nr. wird vergeben: <span class="font-mono font-semibold text-ink-700">{invoiceNumberPreview}</span>
			</span>
			<div class="flex gap-2 sm:ml-auto">
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<Button type="button" href={cancelHref} variant="ghost" class="flex-1 sm:flex-none">Abbrechen</Button>
				<Button
					type="submit"
					disabled={ctaDisabled}
					data-testid="invoice-submit"
					class={cn(
						'flex-1 sm:flex-none',
						gateDisabled && !submitting
							? 'bg-secondary text-ink-500 opacity-100 hover:bg-secondary disabled:opacity-100'
							: ''
					)}
				>
					{submitting ? submitLabelPending : submitLabel}
				</Button>
			</div>
			{#if gateDisabled && !submitting}
				<p class="text-xs text-ink-500 sm:basis-full sm:order-last" aria-live="polite">
					Fehlt noch: {gateMissing.join(' · ')}.
				</p>
			{/if}
		</div>
	</form>

	<!-- ── Live preview ──────────────────────────────────────────────── -->
	<div class={cn('lg:sticky lg:top-6', mobileView === 'formular' ? 'hidden lg:block' : '')}>
		<InvoicePdfPreview input={previewInput} />
	</div>
</div>

<AddCustomerDialog
	bind:open={quickAddOpen}
	onSuccess={(newCustomerId) => {
		customerId = newCustomerId;
	}}
/>

<!--
	Rechnung detail — Aurora (rechnungen-suite-v2, "B · Detail").

	Anatomy: breadcrumb, detail-head (kicker + id-chip + Kunde-Titel + Betrag
	grün + Status-Chip + Aktionen), then a 2-col workbench — LEFT a `.doc-sheet`
	preview of the canonical PDF (always-light paper, never inverts in dark
	mode), RIGHT a rail of cards (Eckdaten, Zahlung, PDF, Verlauf). Rechnungen
	sind Einnahmen → grün; „offen" ist NEUTRAL (nie amber), „überfällig" amber,
	„bezahlt" grün (color doctrine, rechnungen.md).

	G1: kein „Korrektur"-Menüpunkt — `?/supersede` bleibt Code-only.
	G3 (E-PR2 scope): "Per Mail senden" is rendered but intentionally never
	wired to an action here — always disabled with a visible `.gate-line`
	reason. The real send flow + customer-email gate land in a later PR
	(mail-invoice.md); the load() here has no customerEmail field yet.

	Behavioural contract preserved verbatim from the pre-Aurora version: the
	?job= PDF poll loop, the mark-paid / undo-payment / retry-pdf actions,
	?paid=1 / ?undone=1 flash toasts (now read straight off page.url.searchParams,
	mirroring the list page's onMount), the 404 page (thrown by the load — no UI
	change needed here), and every existing data-testid.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import FactsTable from '$lib/components/ui/facts-table/FactsTable.svelte';
	import SphereBadge from '$lib/components/admin/transactions/fields/SphereBadge.svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import InvoicePdfStatusBadge from '$lib/components/admin/invoices/InvoicePdfStatusBadge.svelte';
	import InvoiceHistory from '$lib/components/admin/invoices/InvoiceHistory.svelte';
	import InvoiceMarkPaidRow from '$lib/components/admin/invoices/InvoiceMarkPaidRow.svelte';
	import { deriveInvoiceStatus } from '$lib/domain/invoices.js';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const inv = $derived(data.invoice);

	// ── date formatting (ISO YYYY-MM-DD → DD.MM.YYYY, no timezone math) ──────
	function fmtIsoDate(iso: string | null): string | null {
		if (!iso) return null;
		const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
		return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
	}

	const datumFmt = $derived(fmtIsoDate(inv.rechnungsdatum) ?? inv.rechnungsdatum);
	const bezahltFmt = $derived(fmtIsoDate(inv.bezahltAm));
	const faelligFmt = $derived(fmtIsoDate(inv.faelligkeitsDatum));

	// doc-sheet "Rechnung an": customerAddressSnapshot's first line already IS
	// the customer name (DIN 5008 sender/recipient convention) — drop it so the
	// bold name above isn't printed twice.
	const customerAddressExtraLines = $derived.by(() => {
		if (!inv.customerAddressSnapshot) return [];
		const lines = inv.customerAddressSnapshot
			.split(/\r?\n/)
			.map((l) => l.trim())
			.filter((l) => l.length > 0);
		if (lines.length > 0 && lines[0] === inv.customerName) {
			return lines.slice(1);
		}
		return lines;
	});

	// ── derived payment/lifecycle state ───────────────────────────────────────
	const status = $derived(deriveInvoiceStatus(inv.bezahltAm, inv.faelligkeitsDatum, data.today));

	// Days overdue = today − Fälligkeitsdatum (both Berlin-ISO YYYY-MM-DD) —
	// identical derivation to InvoiceListRow so the number never drifts
	// between list and detail.
	const overdueDays = $derived.by(() => {
		if (status !== 'überfällig' || !inv.faelligkeitsDatum) return 0;
		const due = Date.parse(inv.faelligkeitsDatum + 'T00:00:00Z');
		const now = Date.parse(data.today + 'T00:00:00Z');
		return Math.max(0, Math.round((now - due) / 86_400_000));
	});

	let pollTimer: ReturnType<typeof setInterval> | null = $state(null);
	let polling = $state(false);
	let markPaidOpen = $state(false);
	let retryingPdf = $state(false);

	// The legally-issued invoice has no usable PDF: generation failed or never
	// ran AND no file was persisted. Offer a recovery action. While a render is
	// in flight (queued/running) we hide the button and let the poll spinner show.
	const pdfMissing = $derived(
		inv.pdfFileId === null && (inv.pdfStatus === 'failed' || inv.pdfStatus === 'not_generated')
	);

	const isFestgeschrieben = $derived(inv.festgeschriebenAt !== null);
	const isSuperseded = $derived(inv.supersededByBusinessId !== null);
	const isPaid = $derived(inv.bezahltAm !== null);

	const editable = $derived(!isPaid && !isFestgeschrieben && !isSuperseded);
	const payable = $derived(!isPaid && !isFestgeschrieben && !isSuperseded);
	const sameDayUndo = $derived(isPaid && inv.bezahltAm === data.today && !isFestgeschrieben);

	// G3 (E-PR2 scope): the send action isn't wired yet, so the button stays
	// disabled unconditionally — but the reason is always visible (never a
	// silent grey button). Once pdf_status='generated', the real remaining
	// gate is the customer's e-mail address; that field isn't in this load()
	// yet (mail-invoice.md DELTA), so we surface it as the fallback reason.
	const sendGateReason = $derived(
		inv.pdfStatus !== 'generated'
			? 'Fehlt noch: PDF muss zuerst erzeugt werden'
			: 'Fehlt noch: Kunde hat keine E-Mail-Adresse hinterlegt'
	);

	function stopPolling(): void {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
		polling = false;
	}

	async function pollOnce(jobId: string): Promise<void> {
		try {
			const res = await fetch(`/api/jobs/${jobId}`);
			if (!res.ok) return;
			const body = (await res.json()) as { status: string };
			if (body.status === 'succeeded' || body.status === 'failed') {
				stopPolling();
				await invalidateAll();
			}
		} catch (err) {
			console.error('[rechnungen/:id] poll failed', err);
		}
	}

	onMount(() => {
		const jobId = data.pollJobId;
		const status = inv.pdfStatus;
		if (jobId && (status === 'queued' || status === 'running')) {
			polling = true;
			void pollOnce(jobId);
			pollTimer = setInterval(() => void pollOnce(jobId), 1000);
		}

		// Flash after the mark-paid / undo-payment POST + redirect (mirrors the
		// list page's onMount, which is the verified-working reference). Reading
		// straight off `page.url.searchParams` — rather than a server-computed
		// `data.*Flash` boolean — is the same pattern proven to fire there, and
		// stays correct even if this route is ever reached via a soft client-side
		// navigation where `data` hasn't been re-derived yet.
		if (page.url.searchParams.get('paid') === '1') {
			toast.success('Als bezahlt markiert');
		} else if (page.url.searchParams.get('undone') === '1') {
			toast.info('Zahlung zurückgenommen');
		}
	});

	onDestroy(() => stopPolling());

	function openMarkPaid(): void {
		markPaidOpen = true;
	}

	function closeMarkPaid(): void {
		markPaidOpen = false;
	}

	// Mobile action-foot: open the panel AND bring the Zahlung rail card into
	// view, since the sticky CTA sits below content the user may not have
	// scrolled to yet.
	function openMarkPaidAndScroll(): void {
		openMarkPaid();
		requestAnimationFrame(() => {
			document
				.getElementById('invoice-zahlung-card')
				?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		});
	}

	const notEditableReason = $derived.by(() => {
		if (isPaid && bezahltFmt) return `Bearbeiten gesperrt — bereits bezahlt am ${bezahltFmt}`;
		if (isFestgeschrieben) return 'Bearbeiten gesperrt — Rechnung ist festgeschrieben';
		if (isSuperseded) return 'Bearbeiten gesperrt — durch Korrektur ersetzt';
		return null;
	});
</script>

<svelte:head>
	<title>Rechnung {inv.businessId} - {page.data.vereinName}</title>
</svelte:head>

<PageShell width="list">
	<!-- breadcrumb -->
	<nav class="mb-4 flex items-center gap-2 text-sm text-ink-500" aria-label="Brotkrümel">
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href="/app/rechnungen" class="inline-flex items-center gap-1 rounded font-semibold text-ink-700 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
			<svg
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 18l-6-6 6-6" />
			</svg>
			Rechnungen
		</a>
		<svg
			class="h-3.5 w-3.5 text-ink-300"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M9 18l6-6-6-6" />
		</svg>
		<span class="truncate font-mono font-semibold text-ink-900">{inv.businessId}</span>
	</nav>

	<!-- ersetzt (this invoice was superseded by a successor) — neutral, never amber -->
	{#if data.successor}
		<div class="mb-4 flex items-start gap-3 rounded-xl border border-border bg-secondary px-4 py-3">
			<svg
				class="mt-0.5 h-4 w-4 shrink-0 text-ink-500"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z"
				/>
				<path stroke-linecap="round" stroke-linejoin="round" d="M14 2v4a2 2 0 002 2h4M10 9H8m8 4H8m8 4H8" />
			</svg>
			<p class="text-sm text-ink-700">
				Ersetzt durch
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href="/app/rechnungen/{data.successor.id}" class="font-mono font-semibold text-primary-text hover:underline"
					>{data.successor.businessId}</a
				>. Diese Rechnung wurde storniert — Bearbeiten und „bezahlt" sind hier deaktiviert.
			</p>
		</div>
	{/if}
	{#if data.predecessor}
		<div class="mb-4 flex items-start gap-3 rounded-xl border border-border bg-secondary px-4 py-3">
			<svg
				class="mt-0.5 h-4 w-4 shrink-0 text-ink-500"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z"
				/>
				<path stroke-linecap="round" stroke-linejoin="round" d="M14 2v4a2 2 0 002 2h4M10 9H8m8 4H8m8 4H8" />
			</svg>
			<p class="text-sm text-ink-700">
				Diese Rechnung ist eine Korrektur von
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
				<a href="/app/rechnungen/{data.predecessor.id}" class="font-mono font-semibold text-primary-text hover:underline"
					>{data.predecessor.businessId}</a
				>.
			</p>
		</div>
	{/if}

	<!-- form error -->
	{#if form && 'error' in form && form.error}
		<div
			class="mb-4 rounded-xl border border-severity-critical/30 bg-severity-critical/10 px-4 py-3 text-sm text-severity-critical-text"
		>
			{form.error}
		</div>
	{/if}

	<!-- festgeschrieben (ADR-0006) — amber lock, Zahlungsfelder bleiben schreibbar -->
	{#if isFestgeschrieben}
		<div
			class="mb-4 flex items-start gap-3 rounded-xl border border-severity-warn/30 bg-severity-warn-tint px-4 py-3"
			data-testid="invoice-festschreibung-info"
		>
			<span
				class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-severity-warn/15 text-severity-warn-text"
				aria-hidden="true"
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="11" width="18" height="11" rx="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
			</span>
			<div class="text-sm">
				<p class="font-semibold text-severity-warn-text">Diese Rechnung ist festgeschrieben.</p>
				<p class="mt-0.5 text-ink-700">
					Korrekturen erfordern eine separate Stornorechnung — bitte zukünftige Phase.
					Zahlungsfelder bleiben schreibbar.
				</p>
			</div>
		</div>
	{/if}

	<!-- detail-head -->
	<div class="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
		<div
			class="-mx-5 -mt-5 rounded-t-2xl bg-gradient-brand-soft px-5 pt-5 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6"
		>
		<div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
			<div class="flex min-w-0 items-start gap-3.5">
				<span
					class="hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-type-einnahme-tint text-type-einnahme sm:grid"
					aria-hidden="true"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M14 2v4a2 2 0 002 2h4M10 9H8m8 4H8m8 4H8"
						/>
					</svg>
				</span>
				<div class="min-w-0">
					<div class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
						Rechnung
						<span class="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-700"
							>{inv.businessId}</span
						>
					</div>
					<h1 class="mt-1 truncate text-2xl font-bold tracking-[-0.02em] text-ink-900">{inv.customerName}</h1>
					<p class="mt-1 text-sm text-ink-500">
						{inv.bezeichnung}{#if inv.leistungszeitraum}<span class="mx-1.5 text-ink-300">·</span
							>Leistung {inv.leistungszeitraum}{/if}
					</p>
				</div>
			</div>
			<div class="shrink-0 sm:text-right">
				<div class="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Rechnungsbetrag</div>
				<div class="mt-1 text-[28px] font-bold leading-none tabular-nums text-type-einnahme">
					{formatMoney(inv.bruttoCents)}
				</div>
				<div class="mt-2 flex sm:justify-end">
					{#if status === 'bezahlt'}
						<span
							class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
						>
							<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"
								><circle cx="12" cy="12" r="10" /><path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M9 12l2 2 4-4"
								/></svg
							>
							bezahlt
						</span>
					{:else if status === 'überfällig'}
						<span
							class="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300"
						>
							<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01"
								/></svg
							>
							überfällig · {overdueDays} {overdueDays === 1 ? 'Tag' : 'Tage'}
						</span>
					{:else}
						<span
							class="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-ink-500"
						>
							<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
								><circle cx="12" cy="12" r="10" /><path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M12 6v6l4 2"
								/></svg
							>
							offen
						</span>
					{/if}
				</div>
			</div>
		</div>
		</div>
		<div class="mt-5 h-0.5 rounded-full bg-gradient-brand" aria-hidden="true"></div>

		<!-- actions -->
		<div class="mt-4 flex flex-wrap items-center gap-2.5">
			{#if payable && !markPaidOpen}
				<Button
					type="button"
					onclick={openMarkPaid}
					data-testid="invoice-mark-paid-open"
					class="hidden md:inline-flex border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
				>
					<svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
						><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg
					>
					Als bezahlt markieren
				</Button>
			{/if}

			{#if editable}
				<Button href={`/app/rechnungen/${inv.id}/edit`} variant="outline" data-testid="invoice-edit-link">
					<svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
						/></svg
					>
					Bearbeiten
				</Button>
			{/if}

			{#if inv.pdfFileId}
				<Button
					href={`/app/rechnungen/${inv.id}/pdf`}
					target="_blank"
					rel="noopener"
					variant="outline"
					data-testid="invoice-pdf-download"
				>
					<svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
						/></svg
					>
					PDF
				</Button>
			{/if}

			{#if !isSuperseded}
				<Button
					type="button"
					variant="ghost"
					disabled
					aria-disabled="true"
					title={sendGateReason}
					data-testid="invoice-send-mail-disabled"
				>
					<svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
						><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg
					>
					Per Mail senden
				</Button>
			{/if}

			{#if !editable && notEditableReason}
				<span class="text-xs text-ink-500" data-testid="invoice-edit-blocked">
					{notEditableReason}
				</span>
			{/if}

			{#if polling}
				<span class="inline-flex items-center gap-1.5 text-xs text-ink-500">
					<span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
					Aktualisiere Status …
				</span>
			{/if}
		</div>

		{#if !isSuperseded}
			<p
				class="mt-2 flex items-center gap-1.5 text-xs font-medium text-severity-warn-text"
				data-testid="invoice-send-gate-reason"
			>
				<svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
					><circle cx="12" cy="12" r="10" /><path stroke-linecap="round" d="M12 8v4M12 16h.01" /></svg
				>
				{sendGateReason}
			</p>
		{/if}
	</div>

	<!-- workbench: doc-sheet (left) + rail (right) -->
	<div class="grid grid-cols-1 items-start gap-6 pb-6 lg:grid-cols-[minmax(0,1fr)_360px]">
		<!-- doc-sheet — always-light paper, never inverts in dark mode -->
		<div
			class="rounded-2xl border border-neutral-200 bg-white p-6 text-neutral-900 shadow-sm sm:p-8"
			data-testid="invoice-doc-sheet"
		>
			<p class="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
				Rechnung · so liegt sie als PDF vor
			</p>
			<h2 class="mt-1 text-xl font-bold text-neutral-900">
				Rechnung <span class="font-mono text-neutral-500">{inv.businessId}</span>
			</h2>
			<p class="mt-1 text-sm text-neutral-500">
				Rechnungsdatum {datumFmt}{#if inv.leistungszeitraum}<span class="mx-1.5">·</span>Leistungszeitraum
					{inv.leistungszeitraum}{/if}
			</p>

			<div class="my-5 h-px bg-neutral-200"></div>

			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
				<div>
					<span class="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Aussteller</span>
					<div class="mt-1.5 text-sm leading-relaxed text-neutral-700">
						<b class="text-neutral-900">{data.verein.name}</b>
						{#each data.verein.adresseLines as line (line)}
							<br />{line}
						{/each}
						{#if data.verein.email}
							<br />{data.verein.email}
						{/if}
					</div>
				</div>
				<div>
					<span class="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Rechnung an</span>
					<div class="mt-1.5 text-sm leading-relaxed text-neutral-700">
						<b class="text-neutral-900">{inv.customerName}</b>
						{#each customerAddressExtraLines as line (line)}
							<br />{line}
						{/each}
					</div>
				</div>
			</div>

			<div class="my-5 h-px bg-neutral-200"></div>

			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wider text-neutral-400">
						<th class="pb-2 font-semibold">Position</th>
						<th class="pb-2 text-right font-semibold">Betrag</th>
					</tr>
				</thead>
				<tbody>
					<tr class="border-b border-neutral-100">
						<td class="py-2.5 pr-4 align-top text-neutral-800">
							{inv.bezeichnung}
							{#if inv.leistungsBeschreibung}
								<div class="mt-0.5 whitespace-pre-line text-xs text-neutral-500">{inv.leistungsBeschreibung}</div>
							{/if}
						</td>
						<td class="py-2.5 text-right align-top tabular-nums text-neutral-900">{formatMoney(inv.bruttoCents)}</td>
					</tr>
					<tr class="border-b border-neutral-100">
						<td class="py-2.5 pr-4 text-neutral-500">
							Umsatzsteuer <span class="text-neutral-400">(§ 19 UStG — keine USt)</span>
						</td>
						<td class="py-2.5 text-right tabular-nums text-neutral-500">0,00&nbsp;€</td>
					</tr>
					<tr class="border-t-2 border-neutral-300 font-bold">
						<td class="pt-3 text-neutral-900">Rechnungsbetrag</td>
						<td class="pt-3 text-right tabular-nums text-neutral-900">{formatMoney(inv.bruttoCents)}</td>
					</tr>
				</tbody>
			</table>

			{#if faelligFmt}
				<p class="mt-5 text-sm text-neutral-600">
					Zahlbar bis <strong>{faelligFmt}</strong> auf das Vereinskonto (Verwendungszweck {inv.businessId}). Gemäß
					§ 19 UStG wird keine Umsatzsteuer berechnet — Brutto entspricht Netto.
				</p>
			{:else}
				<p class="mt-5 text-sm text-neutral-600">
					Gemäß § 19 UStG wird keine Umsatzsteuer berechnet — Brutto entspricht Netto.
				</p>
			{/if}
			<p class="mt-2 text-xs italic text-neutral-400">Kanonisches PDF — revisionssicher im Blob abgelegt.</p>
		</div>

		<!-- rail -->
		<div class="flex flex-col gap-5">
			<!-- Eckdaten -->
			<div class="rounded-2xl border border-border bg-card p-4 shadow-sm">
				<h2 class="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
						><circle cx="12" cy="12" r="10" /><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 16v-4M12 8h.01"
						/></svg
					>
					Eckdaten
				</h2>
				<FactsTable rows={[]} labelWidth="128px" data-testid="invoice-facts">
					<div
						class="grid min-h-10 items-baseline gap-4 border-t border-hairline py-2.5 first:border-t-0"
						style="grid-template-columns: 128px minmax(0, 1fr)"
					>
						<dt class="text-xs font-medium text-ink-500">Rechnungsdatum</dt>
						<dd class="min-w-0 text-right text-[13px] font-semibold tabular-nums text-ink-900">{datumFmt}</dd>
					</div>
					<div
						class="grid min-h-10 items-baseline gap-4 border-t border-hairline py-2.5"
						style="grid-template-columns: 128px minmax(0, 1fr)"
					>
						<dt class="text-xs font-medium text-ink-500">Leistungszeitraum</dt>
						<dd class="min-w-0 text-right text-[13px] font-semibold text-ink-900">{inv.leistungszeitraum}</dd>
					</div>
					<div
						class="grid min-h-10 items-baseline gap-4 border-t border-hairline py-2.5"
						style="grid-template-columns: 128px minmax(0, 1fr)"
					>
						<dt class="text-xs font-medium text-ink-500">Fällig bis</dt>
						<dd
							class="min-w-0 text-right text-[13px] font-semibold tabular-nums {status === 'überfällig'
								? 'text-severity-warn-text'
								: 'text-ink-900'}"
						>
							{faelligFmt ?? '—'}
						</dd>
					</div>
					<div
						class="grid min-h-10 items-baseline gap-4 border-t border-hairline py-2.5"
						style="grid-template-columns: 128px minmax(0, 1fr)"
					>
						<dt class="text-xs font-medium text-ink-500">Kategorie</dt>
						<dd class="min-w-0 text-right text-[13px] font-semibold text-ink-900">
							<div class="truncate">{inv.kategorieNameSnapshot}</div>
							<div class="mt-1 flex justify-end">
								<SphereBadge sphere={inv.sphereSnapshot} />
							</div>
						</dd>
					</div>
					{#if inv.projectName}
						<div
							class="grid min-h-10 items-baseline gap-4 border-t border-hairline py-2.5"
							style="grid-template-columns: 128px minmax(0, 1fr)"
						>
							<dt class="text-xs font-medium text-ink-500">Projekt</dt>
							<dd class="min-w-0 text-right text-[13px] font-semibold">
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href="/app/projekte/{inv.projectId}" class="text-primary-text hover:underline">{inv.projectName}</a>
							</dd>
						</div>
					{/if}
					<div
						class="grid min-h-10 items-baseline gap-4 border-t border-hairline py-2.5"
						style="grid-template-columns: 128px minmax(0, 1fr)"
					>
						<dt class="text-xs font-medium text-ink-500">Kund:in</dt>
						<dd class="min-w-0 text-right text-[13px] font-semibold">
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
							<a href="/app/kunden/{inv.customerId}" class="text-primary-text hover:underline">{inv.customerName}</a>
						</dd>
					</div>
				</FactsTable>
			</div>

			<!-- Zahlung -->
			<div
				id="invoice-zahlung-card"
				class="rounded-2xl border border-border bg-card p-4 shadow-sm scroll-mt-4"
			>
				<h2 class="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
						><path d="M4 10h12" /><path d="M4 14h9" /><path
							d="M19 6a7.7 7.7 0 00-5.2-2A7.9 7.9 0 006 12a7.9 7.9 0 007.8 8 7.7 7.7 0 005.2-2"
						/></svg
					>
					Zahlung
				</h2>

				{#if isPaid && bezahltFmt}
					<div
						class="flex items-start gap-3 rounded-xl border border-type-einnahme/25 bg-type-einnahme-tint px-3.5 py-3"
						data-testid="invoice-paid-banner"
					>
						<span
							class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-type-einnahme text-white"
							aria-hidden="true"
						>
							<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" aria-hidden="true"
								><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg
							>
						</span>
						<div class="min-w-0 text-sm">
							<p class="font-semibold text-type-einnahme">Bezahlt am {bezahltFmt}</p>
							{#if inv.paidByIncomeBusinessId && inv.paidByIncomeId}
								<p class="mt-0.5 text-ink-700">
									Als Einnahme
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
									<a href="/app/einnahmen/{inv.paidByIncomeId}" class="font-mono font-semibold text-type-einnahme hover:underline"
										>{inv.paidByIncomeBusinessId}</a
									> verbucht.
								</p>
							{/if}
						</div>
					</div>
					{#if sameDayUndo}
						<form method="POST" action="?/undo-payment" class="mt-3">
							<button
								type="submit"
								data-testid="invoice-undo-payment"
								class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:bg-secondary"
							>
								<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/></svg
								>
								Zahlung rückgängig
							</button>
						</form>
						<p class="mt-1.5 text-xs text-ink-500">Nur heute noch möglich — löscht die Einnahme wieder.</p>
					{/if}
				{:else if markPaidOpen && payable}
					<InvoiceMarkPaidRow
						invoiceId={inv.id}
						businessId={inv.businessId}
						customerName={inv.customerName}
						bezeichnung={inv.bezeichnung}
						bruttoCents={inv.bruttoCents}
						rechnungsdatum={inv.rechnungsdatum}
						actionUrl="?/mark-paid"
						today={data.today}
						onCancel={closeMarkPaid}
					/>
				{:else if payable}
					<p class="text-sm text-ink-500">Diese Rechnung ist offen — noch keine Zahlung erfasst.</p>
				{:else}
					<p class="text-sm text-ink-500">—</p>
				{/if}
			</div>

			<!-- PDF -->
			<div class="rounded-2xl border border-border bg-card p-4 shadow-sm">
				<h2 class="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z"
						/><path stroke-linecap="round" stroke-linejoin="round" d="M14 2v4a2 2 0 002 2h4M10 9H8m8 4H8m8 4H8" /></svg
					>
					PDF
				</h2>

				<div class="flex flex-wrap items-center gap-2">
					<InvoicePdfStatusBadge pdfStatus={inv.pdfStatus} hasFile={inv.pdfFileId !== null} />
					{#if polling}
						<span class="inline-flex items-center gap-1.5 text-xs text-ink-500">
							<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span> wird aktualisiert …
						</span>
					{/if}
				</div>

				{#if inv.pdfStatus === 'failed' && inv.pdfStatusError}
					<div
						class="mt-3 flex items-start gap-2.5 rounded-xl border border-severity-critical/25 bg-severity-critical/10 px-3.5 py-3"
					>
						<svg
							class="mt-0.5 h-4 w-4 shrink-0 text-severity-critical-text"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="10" /><path stroke-linecap="round" d="M12 8v4M12 16h.01" />
						</svg>
						<p class="text-xs text-severity-critical-text">
							PDF-Erstellung fehlgeschlagen: {inv.pdfStatusError}
						</p>
					</div>
				{/if}

				<div class="mt-3 flex flex-wrap items-center gap-2">
					{#if inv.pdfFileId}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href="/app/rechnungen/{inv.id}/pdf" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:bg-secondary">
							<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
								/></svg
							>
							Laden
						</a>
					{/if}

					{#if pdfMissing}
						<form
							method="POST"
							action="?/retry-pdf"
							use:enhance={() => {
								retryingPdf = true;
								return async ({ update }) => {
									await update();
									retryingPdf = false;
								};
							}}
						>
							<Button
								type="submit"
								variant="outline"
								size="sm"
								disabled={retryingPdf}
								data-testid="invoice-retry-pdf"
							>
								<svg
									class="mr-1.5 h-4 w-4"
									class:animate-spin={retryingPdf}
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
									/>
								</svg>
								{inv.pdfStatus === 'failed' ? 'PDF neu erzeugen' : 'PDF jetzt erstellen'}
							</Button>
						</form>
					{/if}
				</div>
			</div>

			<!-- Verlauf -->
			<div class="rounded-2xl border border-border bg-card p-4 shadow-sm">
				<h2 class="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
					<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
						><circle cx="12" cy="12" r="10" /><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 6v6l4 2"
						/></svg
					>
					Verlauf
				</h2>
				<InvoiceHistory entries={data.auditEntries} />
			</div>
		</div>
	</div>
</PageShell>

<!-- mobile sticky action-foot — the ONE primary action, above the tab bar -->
{#if payable}
	<div
		class="fixed bottom-[calc(56px+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm md:hidden"
		data-testid="invoice-action-foot"
	>
		<Button
			type="button"
			onclick={openMarkPaidAndScroll}
			class="w-full border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-400/25 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25"
		>
			<svg class="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
				><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg
			>
			Als bezahlt markieren
		</Button>
	</div>
	<div class="h-20 md:hidden" aria-hidden="true"></div>
{/if}

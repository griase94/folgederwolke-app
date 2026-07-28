<script lang="ts">
	import { page } from '$app/state';
	/**
	 * /app/mitglieder/bericht/[year] — printable Kassenbericht (spec §11).
	 *
	 * C-S2d: composed on the shared DocSheet paper anatomy (like the
	 * Zuwendungsbestätigung) — a physical-paper sheet that does NOT invert in dark
	 * mode. All neutral text therefore uses the DocSheet-exposed `--dp-*` vars
	 * (never theme text tokens, which would vanish on the white sheet in dark);
	 * status accents use FIXED Tailwind colors (emerald/amber/slate), safe on paper.
	 *
	 * Data contract from the resolver swap (C-S0): status is one of
	 * paid/partial/open/overdue/exempt/permanently_exempt (never fabricated). Amber
	 * discipline (§7.3): only Überfällig is amber; merely-open is neutral. Keeps the
	 * disjoint overdue "davon"-line, the Satz-fehlt hint and the Festschreibungs-
	 * Trust-Zeile.
	 */
	import Check from '@lucide/svelte/icons/check';
	import Circle from '@lucide/svelte/icons/circle';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Ban from '@lucide/svelte/icons/ban';
	import Printer from '@lucide/svelte/icons/printer';
	import { DocSheet } from '$lib/components/ui/doc-sheet/index.js';
	import type { PageData } from './$types.js';
	import type { BerichtStatus } from './+page.server.js';

	let { data }: { data: PageData } = $props();

	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	function fmtDateDe(iso: string | null): string {
		if (!iso) return '—';
		const [y, m, d] = iso.split('-');
		return `${d}.${m}.${y}`;
	}

	/** Trust-line timestamp (festgeschrieben_at is a full timestamptz string). */
	function fmtTimestampDe(ts: string | null): string {
		if (!ts) return '';
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return '';
		return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	const statusLabel: Record<BerichtStatus, string> = {
		paid: 'Bezahlt',
		partial: 'Teilzahlung',
		open: 'Offen',
		overdue: 'Überfällig',
		exempt: 'Befreit',
		permanently_exempt: 'Dauerhaft befreit',
		not_applicable: '—'
	};

	// Amber discipline (§7.3): only overdue is amber. Open/partial are neutral.
	// FIXED colors (safe on the light paper sheet in both themes); neutral falls
	// back to the paper ink var via the `kb-status--neutral` class.
	function toneClass(status: BerichtStatus): string {
		switch (status) {
			case 'paid':
				return 'text-emerald-700';
			case 'overdue':
				return 'text-amber-700';
			case 'exempt':
			case 'permanently_exempt':
				return 'text-slate-600';
			default:
				// open / partial / not_applicable → neutral paper ink, never amber
				return 'kb-status--neutral';
		}
	}

	function rowTint(status: BerichtStatus): string {
		if (status === 'paid') return 'bg-emerald-50/60';
		if (status === 'exempt' || status === 'permanently_exempt') return 'bg-slate-50';
		return '';
	}

	const erstelltAm = fmtDateDe(new Date().toISOString().slice(0, 10));
	const subtitle = $derived(
		`Erstellt: ${erstelltAm}` + (data.faelligkeitAt ? ` · Fälligkeit: ${fmtDateDe(data.faelligkeitAt)}` : '')
	);
</script>

<svelte:head>
	<title>Kassenbericht {data.year} – {page.data.vereinName}</title>
</svelte:head>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<!-- Screen-only: back link + print button -->
<div class="no-print mb-4 flex items-center justify-between px-4 py-3 sm:px-6">
	<a
		href="/app/mitglieder?view=matrix&year={data.year}"
		class="text-sm text-muted-foreground hover:text-foreground"
	>
		← Zurück zur Matrix
	</a>
	<button
		type="button"
		onclick={() => window.print()}
		class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		<Printer size={14} aria-hidden="true" />
		Drucken
	</button>
</div>
<!-- eslint-enable svelte/no-navigation-without-resolve -->

<div class="bericht-page mx-auto max-w-4xl px-4 pb-16 sm:px-6">
	<DocSheet eyebrow="Kassenbericht · Mitgliedsbeiträge" data-testid="bericht-sheet">
		<!-- Semantic heading on the paper (DocSheet's `title` prop renders a <p>,
		     which would drop the h1 landmark + the report's document title). -->
		<h1 class="kb-title">Kassenbericht Mitgliedsbeiträge {data.year}</h1>
		<p class="kb-subtitle">{subtitle}</p>

		{#if data.satzMissing}
			<p class="kb-hint" data-testid="bericht-satz-missing">
				Für {data.year} ist kein Beitragssatz festgelegt — Sollbeträge werden nicht ausgewiesen.
			</p>
		{/if}

		<!-- Summary totals -->
		<div class="kb-summary" data-testid="bericht-totals" aria-label="Zusammenfassung">
			<div class="kb-stat">
				<span class="kb-stat-lbl">Bezahlt</span>
				<span class="kb-stat-val text-emerald-700" data-testid="bericht-paid-count">
					{data.totals.paidCount}
				</span>
				<span class="kb-stat-sub" data-testid="bericht-paid-sum">{eur(data.totals.paidSumCents)}</span>
			</div>
			<div class="kb-stat">
				<span class="kb-stat-lbl">Offen</span>
				<span class="kb-stat-val" data-testid="bericht-open-count">{data.totals.openCount}</span>
				<span class="kb-stat-sub" data-testid="bericht-open-sum">{eur(data.totals.openSumCents)}</span>
				{#if data.totals.overdueCount > 0}
					<span class="kb-stat-overdue text-amber-700" data-testid="bericht-overdue-sum">
						davon überfällig: {data.totals.overdueCount} · {eur(data.totals.overdueSumCents)}
					</span>
				{/if}
			</div>
			<div class="kb-stat">
				<span class="kb-stat-lbl">Befreit</span>
				<span class="kb-stat-val text-slate-600">{data.totals.exemptCount}</span>
			</div>
			<div class="kb-stat">
				<span class="kb-stat-lbl">Gesamt</span>
				<span class="kb-stat-val">{data.totals.totalMembers}</span>
			</div>
		</div>

		<!-- Per-member table -->
		<table class="kb-table" data-testid="bericht-table" aria-label="Mitglieder-Beitragsstatus">
			<thead>
				<tr>
					<th scope="col">Mitglied</th>
					<th scope="col">Eintritt</th>
					<th scope="col">Status</th>
					<th scope="col" class="kb-num">Betrag</th>
					<th scope="col">Bezahlt am</th>
					<th scope="col">Anmerkung</th>
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row (row.memberId)}
					<tr class={rowTint(row.status)} data-testid="bericht-row" data-status={row.status}>
						<td class="kb-name">{row.name}</td>
						<td class="kb-num kb-faint">{fmtDateDe(row.eintrittsDatum)}</td>
						<td>
							<span class="kb-status {toneClass(row.status)}">
								{#if row.status === 'paid'}
									<Check size={12} aria-hidden="true" />
								{:else if row.status === 'overdue'}
									<CircleAlert size={12} aria-hidden="true" />
								{:else if row.status === 'exempt' || row.status === 'permanently_exempt'}
									<Ban size={12} aria-hidden="true" />
								{:else}
									<Circle size={12} aria-hidden="true" />
								{/if}
								{statusLabel[row.status]}
							</span>
							{#if row.status === 'partial'}
								<span class="kb-partial kb-faint">
									{eur(row.paidCents)} von {eur(row.betragCents)}
								</span>
							{/if}
						</td>
						<td class="kb-num">{eur(row.betragCents)}</td>
						<td class="kb-num kb-faint">{fmtDateDe(row.gezahltAm)}</td>
						<td class="kb-note-cell kb-faint">{row.anmerkung ?? ''}</td>
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr class="kb-foot">
					<td colspan="3">Summe ({data.totals.totalMembers} Mitglieder)</td>
					<td class="kb-num">{eur(data.totals.paidSumCents + data.totals.openSumCents)}</td>
					<td colspan="2" class="kb-faint">
						davon bezahlt: {eur(data.totals.paidSumCents)} · offen: {eur(data.totals.openSumCents)}
					</td>
				</tr>
			</tfoot>
		</table>

		{#if data.isLockedYear}
			<p class="kb-trust" data-testid="bericht-trust-line">
				Buchungsjahr {data.year} festgeschrieben{#if data.festgeschriebenAm}&nbsp;am {fmtTimestampDe(
						data.festgeschriebenAm,
					)}{/if} — Zahlen unveränderlich.
			</p>
		{/if}

		<!-- Signature lines for Kassenprüfer -->
		<div class="kb-sigs" aria-label="Unterschriften Kassenprüfer">
			<div class="kb-sig"><div class="kb-sig-line"></div><span>Kassenprüfer/in · Datum</span></div>
			<div class="kb-sig"><div class="kb-sig-line"></div><span>Kassenprüfer/in · Datum</span></div>
		</div>
	</DocSheet>
</div>

<style>
	/* Paper body classes — read the DocSheet-exposed --dp-* vars so the sheet
	   stays physical paper (light) in BOTH themes. Status accents use fixed
	   Tailwind colors (applied in markup), which are already light-safe. */
	.kb-title {
		margin: 0;
		font-size: 16px;
		font-weight: 800;
		line-height: 1.35;
		letter-spacing: -0.005em;
		color: var(--dp-ink);
	}
	.kb-subtitle {
		margin: 5px 0 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--dp-faint);
	}
	.kb-faint {
		color: var(--dp-faint);
	}
	.kb-status--neutral {
		color: var(--dp-ink2);
	}

	.kb-hint {
		margin: 4px 0 16px;
		border-radius: 8px;
		border: 1px solid var(--dp-line2);
		background: rgb(36 24 48 / 0.03);
		padding: 8px 12px;
		font-size: 12px;
		color: var(--dp-faint);
	}

	.kb-summary {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 14px;
		border-top: 1px solid var(--dp-line2);
		border-bottom: 1px solid var(--dp-line2);
		padding: 14px 0;
		margin: 6px 0 18px;
	}
	.kb-stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.kb-stat-lbl {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dp-faint);
	}
	.kb-stat-val {
		font-size: 20px;
		font-weight: 800;
		line-height: 1.1;
		color: var(--dp-ink);
		font-variant-numeric: tabular-nums;
	}
	.kb-stat-sub {
		font-size: 11px;
		color: var(--dp-faint);
		font-variant-numeric: tabular-nums;
	}
	.kb-stat-overdue {
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}

	.kb-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}
	.kb-table thead th {
		text-align: left;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--dp-faint);
		padding: 0 8px 6px;
		border-bottom: 1px solid var(--dp-line2);
	}
	.kb-table tbody td {
		padding: 7px 8px;
		border-bottom: 1px solid var(--dp-line);
		color: var(--dp-ink2);
		vertical-align: top;
	}
	.kb-table .kb-name {
		font-weight: 600;
		color: var(--dp-ink);
	}
	.kb-num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.kb-table thead th.kb-num {
		text-align: right;
	}
	.kb-status {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		font-weight: 600;
	}
	.kb-partial {
		display: block;
		margin-top: 2px;
		font-size: 10.5px;
		font-variant-numeric: tabular-nums;
	}
	.kb-note-cell {
		font-size: 11px;
	}
	.kb-foot td {
		padding: 8px;
		border-top: 2px solid var(--dp-line2);
		font-weight: 700;
		color: var(--dp-ink);
	}
	.kb-foot td.kb-faint {
		font-weight: 400;
	}

	.kb-trust {
		margin-top: 16px;
		font-size: 10.5px;
		color: var(--dp-faint);
		font-variant-numeric: tabular-nums;
	}

	.kb-sigs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 28px;
		margin-top: 40px;
	}
	.kb-sig-line {
		border-bottom: 1px solid var(--dp-ink2);
		height: 0;
		margin-bottom: 5px;
	}
	.kb-sig span {
		font-size: 10.5px;
		color: var(--dp-faint);
	}

	/* Print — hide screen chrome, let the sheet fill the page. */
	@media print {
		:global(.no-print) {
			display: none !important;
		}
		.bericht-page {
			max-width: 100%;
			padding: 0;
		}
		.bericht-page :global(.doc-sheet) {
			border: 0;
			border-radius: 0;
			box-shadow: none;
			padding: 0;
		}
		.kb-foot,
		.kb-table tbody tr,
		.kb-sigs {
			break-inside: avoid;
		}
	}

	@media (max-width: 640px) {
		.kb-summary {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>

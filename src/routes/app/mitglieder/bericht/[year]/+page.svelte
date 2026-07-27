<script lang="ts">
	import { page } from '$app/state';
	/**
	 * /app/mitglieder/bericht/[year] — printable Kassenbericht (spec §11).
	 *
	 * C-Lane D2: consumes the resolver-swapped contract — status is one of
	 * paid/partial/open/overdue/exempt/permanently_exempt (never fabricated).
	 * Amber discipline (§7.3): only Überfällig is amber; merely-open is neutral.
	 * The full DocSheet paper composition lands in the read-chain slice (S2);
	 * this pass fixes the data contract + the amber regression + adds the
	 * overdue "davon"-line, the Satz-fehlt hint and the Festschreibungs-Trust-Zeile.
	 */
	import Check from '@lucide/svelte/icons/check';
	import Circle from '@lucide/svelte/icons/circle';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Ban from '@lucide/svelte/icons/ban';
	import Printer from '@lucide/svelte/icons/printer';
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
	function toneClass(status: BerichtStatus): string {
		switch (status) {
			case 'paid':
				return 'text-emerald-700 dark:text-emerald-400';
			case 'overdue':
				return 'text-amber-700 dark:text-amber-400';
			case 'exempt':
			case 'permanently_exempt':
				return 'text-slate-600 dark:text-slate-400';
			default:
				// open / partial / not_applicable → neutral, never amber
				return 'text-muted-foreground';
		}
	}

	function rowTint(status: BerichtStatus): string {
		if (status === 'paid') return 'bg-emerald-50/40 dark:bg-emerald-950/10';
		if (status === 'exempt' || status === 'permanently_exempt')
			return 'bg-slate-50/60 dark:bg-slate-900/20';
		return '';
	}
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

<!-- Report body — same layout on screen and print -->
<div class="bericht-page mx-auto max-w-4xl px-4 pb-16 sm:px-6">
	<!-- Header -->
	<header class="mb-6">
		<h1 class="text-2xl font-bold tracking-tight text-foreground">
			Kassenbericht Mitgliedsbeiträge {data.year}
		</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Erstellt: {fmtDateDe(new Date().toISOString().slice(0, 10))}
			{#if data.faelligkeitAt}
				· Fälligkeit: {fmtDateDe(data.faelligkeitAt)}
			{/if}
		</p>
	</header>

	{#if data.satzMissing}
		<p
			class="mb-6 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground"
			data-testid="bericht-satz-missing"
		>
			Für {data.year} ist kein Beitragssatz festgelegt — Sollbeträge werden nicht ausgewiesen.
		</p>
	{/if}

	<!-- Summary totals -->
	<section class="mb-6" aria-label="Zusammenfassung">
		<div
			class="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-4"
			data-testid="bericht-totals"
		>
			<div>
				<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bezahlt</dt>
				<dd
					class="mt-1 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400"
					data-testid="bericht-paid-count"
				>
					{data.totals.paidCount}
				</dd>
				<dd class="text-xs tabular-nums text-muted-foreground" data-testid="bericht-paid-sum">
					{eur(data.totals.paidSumCents)}
				</dd>
			</div>
			<div>
				<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Offen</dt>
				<dd
					class="mt-1 text-xl font-bold tabular-nums text-foreground"
					data-testid="bericht-open-count"
				>
					{data.totals.openCount}
				</dd>
				<dd class="text-xs tabular-nums text-muted-foreground" data-testid="bericht-open-sum">
					{eur(data.totals.openSumCents)}
				</dd>
				{#if data.totals.overdueCount > 0}
					<dd
						class="mt-0.5 text-xs tabular-nums text-amber-700 dark:text-amber-400"
						data-testid="bericht-overdue-sum"
					>
						davon überfällig: {data.totals.overdueCount} · {eur(data.totals.overdueSumCents)}
					</dd>
				{/if}
			</div>
			<div>
				<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Befreit</dt>
				<dd class="mt-1 text-xl font-bold tabular-nums text-slate-600 dark:text-slate-400">
					{data.totals.exemptCount}
				</dd>
			</div>
			<div>
				<dt class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gesamt</dt>
				<dd class="mt-1 text-xl font-bold tabular-nums text-foreground">
					{data.totals.totalMembers}
				</dd>
			</div>
		</div>
	</section>

	<!-- Per-member table -->
	<section aria-label="Mitglieder-Beitragsstatus">
		<div class="overflow-x-auto rounded-xl border border-border">
			<table class="w-full text-sm" data-testid="bericht-table">
				<thead>
					<tr class="border-b border-border bg-muted/50 text-left">
						<th class="px-4 py-2.5 font-semibold text-foreground" scope="col">Mitglied</th>
						<th class="px-4 py-2.5 font-semibold text-foreground" scope="col">Eintritt</th>
						<th class="px-4 py-2.5 font-semibold text-foreground" scope="col">Status</th>
						<th class="px-4 py-2.5 text-right font-semibold text-foreground" scope="col">Betrag</th>
						<th class="px-4 py-2.5 font-semibold text-foreground" scope="col">Bezahlt am</th>
						<th class="px-4 py-2.5 font-semibold text-foreground" scope="col">Anmerkung</th>
					</tr>
				</thead>
				<tbody>
					{#each data.rows as row (row.memberId)}
						<tr
							class="border-b border-border last:border-0 {rowTint(row.status)}"
							data-testid="bericht-row"
							data-status={row.status}
						>
							<td class="px-4 py-2.5 font-medium text-foreground">{row.name}</td>
							<td class="px-4 py-2.5 tabular-nums text-muted-foreground">
								{fmtDateDe(row.eintrittsDatum)}
							</td>
							<td class="px-4 py-2.5">
								<span class="inline-flex items-center gap-1 text-xs font-medium {toneClass(row.status)}">
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
									<span class="mt-0.5 block text-xs tabular-nums text-muted-foreground">
										{eur(row.paidCents)} von {eur(row.betragCents)}
									</span>
								{/if}
							</td>
							<td class="px-4 py-2.5 text-right tabular-nums text-foreground">
								{eur(row.betragCents)}
							</td>
							<td class="px-4 py-2.5 tabular-nums text-muted-foreground">
								{fmtDateDe(row.gezahltAm)}
							</td>
							<td class="px-4 py-2.5 text-xs text-muted-foreground">
								{row.anmerkung ?? ''}
							</td>
						</tr>
					{/each}
				</tbody>
				<!-- Totals footer row -->
				<tfoot>
					<tr class="border-t-2 border-border bg-muted/30">
						<td class="px-4 py-2.5 font-semibold text-foreground" colspan="3">
							Summe ({data.totals.totalMembers} Mitglieder)
						</td>
						<td class="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
							{eur(data.totals.paidSumCents + data.totals.openSumCents)}
						</td>
						<td colspan="2" class="px-4 py-2.5 text-xs text-muted-foreground">
							davon bezahlt: {eur(data.totals.paidSumCents)} · offen: {eur(data.totals.openSumCents)}
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	</section>

	{#if data.isLockedYear}
		<p class="mt-6 text-xs text-muted-foreground" data-testid="bericht-trust-line">
			Buchungsjahr {data.year} festgeschrieben{#if data.festgeschriebenAm}
				am {fmtTimestampDe(data.festgeschriebenAm)}{/if} — Zahlen unveränderlich.
		</p>
	{/if}

	<!-- Signature lines for Kassenprüfer -->
	<section class="mt-12 grid grid-cols-2 gap-8" aria-label="Unterschriften Kassenprüfer">
		<div>
			<div class="border-b border-foreground pb-1"></div>
			<p class="mt-1 text-xs text-muted-foreground">Kassenprüfer/in · Datum</p>
		</div>
		<div>
			<div class="border-b border-foreground pb-1"></div>
			<p class="mt-1 text-xs text-muted-foreground">Kassenprüfer/in · Datum</p>
		</div>
	</section>
</div>

<style>
	/* Print styles — hide screen chrome, optimise for paper. */
	@media print {
		:global(.no-print) {
			display: none !important;
		}

		.bericht-page {
			max-width: 100%;
			padding: 0;
		}

		/* Prevent the totals footer from splitting across pages. */
		tfoot {
			break-inside: avoid;
		}

		/* Keep each member row together — avoids half-rows at page breaks. */
		tbody tr {
			break-inside: avoid;
		}

		/* Ensure the signature section always starts on a fresh block. */
		section[aria-label='Unterschriften Kassenprüfer'] {
			break-before: auto;
			break-inside: avoid;
		}
	}
</style>

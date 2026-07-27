<!--
	UebersichtTab — the EÜR-Übersicht read screen (D-Flow §2.2, plate
	eur-uebersicht-v4). The screen is the Beweisobjekt: no loud primary action.

	  · Zwei Hero-Karten: Überschuss (Einnahmen grün / Ausgaben plum) + §64-
	    Spielraum via the locked FreigrenzeGauge chart.
	  · Vier-Sphären-Matrix (immer alle vier, Null-Zeilen gemutet) mit sichtbarer
	    Kreuzprobe-Fußzeile „Σ Sphären = EÜR ✓" (berechnet, nie hart codiert).
	  · §64-Rechner: misst EINNAHMEN des wGb, nicht den Gewinn.
	  · Rail: Monats-Verlauf + Abschluss-Bereitschaft (oder „läuft noch" / Paket-
	    Karte im festgeschriebenen Jahr) + Steuerberater-Paket-Teaser (→ Exports).

	D1a: kein Festschreibungs-Knopf hier — die ReadinessCard verlinkt zum Hub.
	D5a: keine eur.pdf/CSV-Direktlinks — alle Downloads leben auf dem Exports-Tab.
-->
<script lang="ts">
	import type { EurWorkspaceData } from '$lib/server/eur/load.js';
	import { formatCentsAsEuro } from '$lib/domain/money.js';
	import { SPHERES, SPHERE_LABELS } from '$lib/domain/sphere.js';
	import { FreigrenzeGauge } from '$lib/components/charts/index.js';
	import MonthlyTrendStrip from './MonthlyTrendStrip.svelte';
	import ReadinessCard from './ReadinessCard.svelte';
	import type { PreFlightListItem } from './PreFlightList.svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import FileArchive from '@lucide/svelte/icons/file-archive';

	interface Props {
		data: EurWorkspaceData;
		/** Retained for route-shape parity; festschreiben feedback now lives at the Hub (D1a). */
		form?: unknown;
	}

	let { data }: Props = $props();

	const eur = (c: number) => formatCentsAsEuro(BigInt(Math.round(c)));

	// ── Kreuzprobe: Σ Sphären == EÜR-Total (computed, never hard-coded) ────────
	const sums = $derived.by(() => {
		let ein = 0;
		let aus = 0;
		let ueb = 0;
		for (const s of SPHERES) {
			const row = data.eur.bySphere[s];
			ein += row.einnahmenCents;
			aus += row.ausgabenCents;
			ueb += row.ueberschussCents;
		}
		return { ein, aus, ueb };
	});
	const kreuzOk = $derived(
		sums.ein === data.eur.totalEinnahmenCents &&
			sums.aus === data.eur.totalAusgabenCents &&
			sums.ueb === data.eur.totalUeberschussCents
	);

	// ── §64 WGB ────────────────────────────────────────────────────────────────
	const wgb = $derived(data.wgb);

	// ── Rail-card mode: closed → Paket, running/future → „läuft", else Readiness ─
	const yearNotFuture = $derived(data.preFlight.items.find((i) => i.id === 'yearNotFuture'));
	const isRunningOrFuture = $derived(yearNotFuture?.status === 'block');

	const readinessItems = $derived<PreFlightListItem[]>(
		data.preFlight.items.map((it) => ({
			id: it.id,
			label: it.label,
			status: it.status,
			detail: it.detail,
			fixHref: it.fixHref
		}))
	);
	const passedCount = $derived(data.preFlight.items.filter((i) => i.status === 'pass').length);
	const totalCount = $derived(data.preFlight.items.length);
	const readinessCallout = $derived<{ tone: 'ok' | 'warn'; title: string; sub?: string }>(
		data.preFlight.canFestschreiben
			? {
					tone: 'ok',
					title: `${data.year} ist abschlussbereit.`,
					sub:
						data.preFlight.warnings > 0
							? `${data.preFlight.warnings} Warnung${data.preFlight.warnings === 1 ? '' : 'en'} — Belege dürfen nachkommen.`
							: undefined
				}
			: {
					tone: 'warn',
					title: `${data.preFlight.blockers} Blocker offen`,
					sub: 'Erst beheben, dann kann das Jahr festgeschrieben werden.'
				}
	);

	const exportsHref = $derived(`/app/jahresabschluss/${data.year}/exports`);
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<div class="space-y-5">
	<!-- Hero-Band: Überschuss + §64-Spielraum -->
	<div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
		<!-- Überschuss-Hero -->
		<div class="hero-card">
			<p class="hero-eyebrow">Überschuss {data.year}</p>
			<p
				class="hero-amount"
				class:is-zero={data.eur.totalUeberschussCents === 0}
				data-testid="ueberschuss-hero"
			>
				{eur(data.eur.totalUeberschussCents)}
			</p>
			<div class="hero-lines">
				<div class="hl-row">
					<span class="hl-lbl">Einnahmen</span>
					<span class="hl-amt ein">{eur(data.eur.totalEinnahmenCents)}</span>
				</div>
				{#if data.spendenEinnahmenCents > 0}
					<div class="hl-row hl-sub">
						<span class="hl-lbl">davon Spenden</span>
						<span class="hl-amt spe">{eur(data.spendenEinnahmenCents)}</span>
					</div>
				{/if}
				{#if data.beitragEinnahmenCents > 0}
					<div class="hl-row hl-sub">
						<span class="hl-lbl">davon Mitgliedsbeiträge</span>
						<span class="hl-amt">{eur(data.beitragEinnahmenCents)}</span>
					</div>
				{/if}
				<div class="hl-row">
					<span class="hl-lbl">Ausgaben</span>
					<span class="hl-amt aus">−{eur(data.eur.totalAusgabenCents)}</span>
				</div>
			</div>
			<p class="hero-note">Einnahmen inkl. Spenden &amp; Mitgliedsbeiträge.</p>
		</div>

		<!-- §64-Spielraum via FreigrenzeGauge (locked dataviz) -->
		<div class="hero-card">
			<p class="hero-eyebrow">§ 64 Abs. 3 AO · Wirtschaftlicher Spielraum</p>
			<FreigrenzeGauge
				umsatzCents={wgb.einnahmenCents}
				capCents={wgb.thresholdCents}
				year={data.year}
				class="mt-1"
			/>
			{#if wgb.bucket === 'safe'}
				<p class="gauge-reassure">Gemeinnützigkeit nicht gefährdet. Warnung ab 80 %.</p>
			{:else if wgb.bucket === 'warning'}
				<p class="gauge-reassure warn">
					Achtung: nur noch {eur(wgb.remainingCents)} bis zur Freigrenze.
				</p>
			{:else}
				<p class="gauge-reassure over">
					Freigrenze überschritten — Körperschaftsteuer-Pflicht prüfen.
				</p>
			{/if}
		</div>
	</div>

	<!-- Main + Rail -->
	<div class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
		<div class="space-y-5">
			<!-- Vier-Sphären-Matrix -->
			<section class="panel" aria-labelledby="matrix-head">
				<div class="panel-head">
					<h2 id="matrix-head" class="panel-title">Vier-Sphären-Matrix</h2>
					<p class="panel-sub">Einnahmen inkl. Spenden &amp; Mitgliedsbeiträge</p>
				</div>
				<div class="dt-wrap"><table class="dt" data-testid="sphere-matrix">
					<thead>
						<tr>
							<th scope="col" class="lbl-col">Sphäre</th>
							<th scope="col" class="num">Einnahmen</th>
							<th scope="col" class="num">Ausgaben</th>
							<th scope="col" class="num">Überschuss</th>
						</tr>
					</thead>
					<tbody>
						{#each SPHERES as s (s)}
							{@const row = data.eur.bySphere[s]}
							{@const empty = row.einnahmenCents === 0 && row.ausgabenCents === 0}
							<tr data-testid={`matrix-row-${s}`} class:is-zero={empty}>
								<td class="lbl">
									<span class="sb" style={`background:var(--sphere-${s})`}></span>
									{SPHERE_LABELS[s]}
								</td>
								<td class="num">{eur(row.einnahmenCents)}</td>
								<td class="num">{eur(row.ausgabenCents)}</td>
								<td class="num strong" class:ein={row.ueberschussCents >= 0} class:aus={row.ueberschussCents < 0}>
									{eur(row.ueberschussCents)}
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="sum-row">
							<td class="lbl">Σ EÜR</td>
							<td class="num" data-testid="matrix-total-einnahmen">{eur(data.eur.totalEinnahmenCents)}</td>
							<td class="num" data-testid="matrix-total-ausgaben">{eur(data.eur.totalAusgabenCents)}</td>
							<td
								class="num strong"
								class:ein={data.eur.totalUeberschussCents >= 0}
								class:aus={data.eur.totalUeberschussCents < 0}
								data-testid="matrix-total-ueberschuss"
							>
								{eur(data.eur.totalUeberschussCents)}
							</td>
						</tr>
					</tfoot>
				</table></div>

				{#if kreuzOk}
					<div class="kreuz" data-testid="kreuzprobe">
						<span class="ck"><CircleCheck class="size-3.5" aria-hidden="true" /></span>
						<span class="kt">
							Σ Sphären = EÜR
							<b>{eur(sums.ein)}</b> / <b>{eur(sums.aus)}</b> / <b>{eur(sums.ueb)}</b> ✓
						</span>
					</div>
				{:else}
					<div class="kreuz is-mismatch" data-testid="kreuzprobe-mismatch">
						<span class="kt">
							Datenfehler: Σ der Sphären weicht von der EÜR-Summe ab — bitte prüfen.
						</span>
					</div>
				{/if}
			</section>

			<!-- §64-Rechner: misst EINNAHMEN, nicht Gewinn -->
			<section class="panel rechner" aria-labelledby="rechner-head">
				<div class="panel-head">
					<h2 id="rechner-head" class="panel-title">§ 64-Rechner</h2>
				</div>
				<p class="rule">
					§ 64 Abs. 3 AO misst die <span class="hl">Einnahmen</span> des wirtschaftlichen
					Geschäftsbetriebs, nicht den Gewinn.
				</p>
				<div class="r-row">
					<span class="rl">Einnahmen wGb {data.year}</span>
					<span class="rv">{eur(wgb.einnahmenCents)}</span>
				</div>
				<div class="r-row">
					<span class="rl">Freigrenze (§ 64 Abs. 3 AO)</span>
					<span class="rv">{eur(wgb.thresholdCents)}</span>
				</div>
				<div class="r-row result">
					<span class="rl">{wgb.remainingCents >= 0 ? 'Verbleibt bis zur Freigrenze' : 'Überschritten um'}</span>
					<span class="rv" class:over={wgb.remainingCents < 0}>
						{eur(Math.abs(wgb.remainingCents))}
					</span>
				</div>
			</section>
		</div>

		<!-- Rail -->
		<div class="space-y-5">
			<MonthlyTrendStrip monthlyOverschuss={data.monthlyOverschuss} year={data.year} />

			{#if data.closed}
				<!-- festgeschrieben → Paket-Karte wird die sichtbarste Affordance (flat, kein Gradient) -->
				<a class="paket-card" href={exportsHref} data-testid="paket-card">
					<span class="pk-ic"><FileArchive class="size-5" aria-hidden="true" /></span>
					<span class="pk-body">
						<span class="pk-title">Steuerberater-Paket</span>
						<span class="pk-sub">EÜR, Buchungsliste, Spenden &amp; GoBD-Export als ZIP.</span>
						<span class="pk-cta">Zum Export <ArrowRight class="size-[15px]" aria-hidden="true" /></span>
					</span>
				</a>
			{:else if isRunningOrFuture}
				<!-- offenes/laufendes Jahr — ehrliche „läuft noch"-Zeile -->
				<div class="running-card" data-testid="running-card">
					<h3 class="rn-title">{data.year} läuft noch</h3>
					<p class="rn-sub">
						Der Jahresabschluss ist erst nach Jahresende möglich — ab Januar {data.year + 1}.
					</p>
				</div>
			{:else}
				<ReadinessCard
					passedCount={passedCount}
					totalCount={totalCount}
					callout={readinessCallout}
					items={readinessItems}
					linkHref="/app/jahresabschluss"
					linkLabel="Zum Abschluss"
				/>
			{/if}

			{#if !data.closed}
				<!-- Paket-Teaser (→ Exports); ersetzt die alten Direkt-Downloads (D5a) -->
				<a class="teaser" href={exportsHref} data-testid="paket-teaser">
					<span class="ts-body">
						<span class="ts-title">Steuerberater-Paket</span>
						<span class="ts-sub">Alle Downloads gebündelt auf dem Exports-Tab.</span>
					</span>
					<ArrowRight class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
				</a>
			{/if}
		</div>
	</div>

	<!-- Rechts-Copy (sober, T18c) -->
	<p class="legal">
		Ideeller Bereich, Vermögensverwaltung und Zweckbetrieb sind steuerfrei. Der wirtschaftliche
		Geschäftsbetrieb ist steuerfrei unterhalb der Freigrenze von 50.000 €
		(§ 64 Abs. 3 AO i.V.m. JStG 2024, gültig ab 01.01.2025).
	</p>
</div>

<style>
	/* ── Hero cards ─────────────────────────────────────────────────────────── */
	.hero-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 16px;
		box-shadow: var(--shadow-card);
		padding: 20px 22px;
	}
	.hero-eyebrow {
		margin: 0;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ink-500);
	}
	.hero-amount {
		margin: 6px 0 0;
		font-size: 42px;
		font-weight: 800;
		letter-spacing: -0.02em;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		color: var(--type-einnahme);
	}
	.hero-amount.is-zero {
		color: var(--ink-500);
	}
	.hero-lines {
		margin-top: 16px;
		padding-top: 12px;
		border-top: 1px solid var(--hairline);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.hl-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		font-size: 13.5px;
	}
	.hl-lbl {
		color: var(--ink-700);
	}
	.hl-amt {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.hl-amt.ein {
		color: var(--type-einnahme);
	}
	.hl-amt.spe {
		color: var(--type-spende);
	}
	.hl-amt.aus {
		color: var(--type-ausgabe);
	}
	/* „davon"-breakdown lines — indented, quieter than the top-level rows. */
	.hl-sub {
		font-size: 12px;
		padding-left: 12px;
	}
	.hl-sub .hl-lbl {
		color: var(--ink-500);
	}
	.hl-sub .hl-amt {
		font-weight: 600;
	}
	.hero-note {
		margin: 12px 0 0;
		font-size: 11.5px;
		color: var(--ink-500);
	}
	.gauge-reassure {
		margin: 14px 0 0;
		text-align: center;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ink-500);
	}
	.gauge-reassure.warn {
		color: var(--sev-warn-text);
	}
	.gauge-reassure.over {
		color: var(--sev-critical-text);
	}

	/* ── Panels (matrix + rechner) ──────────────────────────────────────────── */
	.panel {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 16px;
		box-shadow: var(--shadow-card);
		padding: 18px 20px;
	}
	.panel-head {
		margin-bottom: 12px;
	}
	.panel-title {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		color: var(--ink-900);
	}
	.panel-sub {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--ink-500);
	}

	/* ── Matrix table ───────────────────────────────────────────────────────── */
	/* Scroll the fixed-column money matrix on a narrow viewport instead of
	   letting the nowrap number columns push the panel wider than the screen
	   (mobile clipping fix — the € column was cut off at 390px). */
	.dt-wrap {
		overflow-x: auto;
	}
	.dt {
		width: 100%;
		min-width: 340px;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}
	.dt th {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--ink-500);
		padding: 0 0 8px;
		border-bottom: 1px solid var(--hairline);
	}
	.dt th.num,
	.dt td.num {
		text-align: right;
		white-space: nowrap;
	}
	.dt td {
		padding: 10px 0;
		font-size: 13px;
		color: var(--ink-900);
		border-bottom: 1px solid var(--hairline);
	}
	.dt td.lbl {
		display: flex;
		align-items: center;
		gap: 9px;
		font-weight: 600;
	}
	.dt th.lbl-col {
		text-align: left;
	}
	.sb {
		width: 10px;
		height: 10px;
		flex: none;
		border-radius: 3px;
	}
	.dt td.num.strong {
		font-weight: 700;
	}
	.dt td.num.ein {
		color: var(--type-einnahme);
	}
	.dt td.num.aus {
		color: var(--type-ausgabe);
	}
	/* muted zero-rows — honest, never hidden */
	.dt tbody tr.is-zero td {
		color: var(--ink-500);
	}
	.dt tbody tr.is-zero td.num.ein,
	.dt tbody tr.is-zero td.num.aus {
		color: var(--ink-500);
	}
	.dt .sum-row td {
		border-bottom: none;
		border-top: 2px solid var(--border);
		padding-top: 11px;
		font-weight: 800;
		color: var(--ink-900);
	}
	.dt .sum-row td.lbl {
		font-weight: 800;
	}

	/* ── Kreuzprobe footer — the visible proof line ─────────────────────────── */
	.kreuz {
		display: flex;
		align-items: flex-start;
		gap: 11px;
		margin-top: 14px;
		padding: 12px 14px;
		border-radius: 10px;
		background: var(--type-einnahme-tint);
	}
	.kreuz .ck {
		flex: none;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--type-einnahme);
		color: var(--card);
		margin-top: 1px;
	}
	.kreuz .kt {
		font-size: 13px;
		color: var(--ink-700);
		line-height: 1.5;
		font-variant-numeric: tabular-nums;
	}
	.kreuz .kt b {
		color: var(--type-einnahme);
		font-weight: 750;
	}
	.kreuz.is-mismatch {
		background: color-mix(in srgb, var(--sev-critical) 12%, transparent);
	}
	.kreuz.is-mismatch .kt {
		color: var(--sev-critical-text);
	}

	/* ── §64 Rechner ────────────────────────────────────────────────────────── */
	.rechner .rule {
		font-size: 13px;
		color: var(--ink-700);
		line-height: 1.55;
		margin: 0 0 12px;
	}
	.rechner .rule .hl {
		color: var(--sphere-wirtschaftlich);
		font-weight: 700;
	}
	.r-row {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
		padding: 9px 0;
		border-top: 1px solid var(--hairline);
		font-size: 13px;
	}
	.r-row .rl {
		color: var(--ink-700);
	}
	.r-row .rv {
		font-weight: 700;
		color: var(--ink-900);
		font-variant-numeric: tabular-nums;
	}
	.r-row.result .rl {
		font-weight: 700;
		color: var(--ink-900);
	}
	.r-row.result .rv {
		color: var(--type-einnahme);
		font-size: 15px;
	}
	.r-row.result .rv.over {
		color: var(--sev-critical-text);
	}

	/* ── Paket-Karte (festgeschrieben) ──────────────────────────────────────── */
	.paket-card {
		display: flex;
		align-items: flex-start;
		gap: 13px;
		padding: 16px 18px;
		border: 1px solid color-mix(in srgb, var(--primary-text) 30%, var(--border));
		border-radius: 16px;
		background: var(--card);
		box-shadow: var(--shadow-card);
		text-decoration: none;
	}
	.paket-card:hover {
		border-color: var(--primary-text);
	}
	.pk-ic {
		flex: none;
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		border-radius: 10px;
		background: color-mix(in srgb, var(--primary-text) 12%, transparent);
		color: var(--primary-text);
	}
	.pk-body {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.pk-title {
		font-size: 14px;
		font-weight: 700;
		color: var(--ink-900);
	}
	.pk-sub {
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--ink-700);
	}
	.pk-cta {
		margin-top: 5px;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 13px;
		font-weight: 700;
		color: var(--primary-text);
	}

	/* ── Running-Karte ──────────────────────────────────────────────────────── */
	.running-card {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 16px;
		box-shadow: var(--shadow-card);
		padding: 18px 20px;
	}
	.rn-title {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		color: var(--ink-900);
	}
	.rn-sub {
		margin: 6px 0 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--ink-700);
	}

	/* ── Paket-Teaser ───────────────────────────────────────────────────────── */
	.teaser {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 16px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--secondary);
		text-decoration: none;
	}
	.teaser:hover {
		background: color-mix(in srgb, var(--secondary) 70%, var(--card));
	}
	.ts-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.ts-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--ink-900);
	}
	.ts-sub {
		font-size: 12px;
		color: var(--ink-500);
	}

	.legal {
		margin: 6px 0 0;
		padding: 14px 18px;
		border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--secondary) 40%, transparent);
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--ink-500);
	}
</style>

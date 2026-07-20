<script lang="ts">
	/**
	 * Dataviz gallery body (dev-only) — every one of the nine locked chart forms
	 * with demo data in its key states. Extracted from +page.svelte so the whole
	 * chart-heavy import graph sits behind a compile-time DEV gate and is
	 * dead-code-eliminated from the production client bundle. See +page.svelte
	 * for the dynamic-import wiring; +page.ts 404s the route outside dev.
	 */
	import type { Snippet } from "svelte";
	import {
		SaldoVerlauf,
		Cashflow,
		SphaerenBars,
		KategorienRanking,
		FreigrenzeGauge,
		BeitraegeStatus,
		BeitragVerlauf,
		EuerStruktur,
		StatTile,
		MiniSparkline,
		CompareBars,
		ProgressRing,
		AgingRail,
		ZoneMeter,
	} from "$lib/components/charts/index.js";

	const YEAR = 2026;

	// ── demo data (integer cents) ──────────────────────────────────────────
	const saldoGrowth = [
		1164000, 1218000, 1176000, 1232000, 1278000, 1326000, 1348000, 1294000, 1362000, 1418000,
		1512000, 1482045,
	];
	const saldoDeficit = [
		300000, 265000, 228000, 190000, 152000, 114000, 76000, 42000, 14000, -2000, -12000, -18000,
	];

	const cashflow = [
		{ einnahmenCents: 82000, ausgabenCents: 34000 },
		{ einnahmenCents: 31000, ausgabenCents: 22000 },
		{ einnahmenCents: 26000, ausgabenCents: 48000 },
		{ einnahmenCents: 54000, ausgabenCents: 29000 },
		{ einnahmenCents: 38000, ausgabenCents: 61000 },
		{ einnahmenCents: 72000, ausgabenCents: 35000 },
		{ einnahmenCents: 29000, ausgabenCents: 18000 },
		{ einnahmenCents: 24000, ausgabenCents: 42000 },
		{ einnahmenCents: 61000, ausgabenCents: 33000 },
		{ einnahmenCents: 45000, ausgabenCents: 27000 },
		{ einnahmenCents: 88000, ausgabenCents: 39000 },
		{ einnahmenCents: 52000, ausgabenCents: 56000 },
	];

	const sphaeren = [
		{ sphere: "ideeller" as const, cents: 824000 },
		{ sphere: "zweckbetrieb" as const, cents: 398000 },
		{ sphere: "vermoegen" as const, cents: 112000 },
		{ sphere: "wirtschaftlich" as const, cents: 52000 },
	];
	const sphaerenDeficit = [
		{ sphere: "ideeller" as const, cents: 824000 },
		{ sphere: "zweckbetrieb" as const, cents: 398000 },
		{ sphere: "vermoegen" as const, cents: 112000 },
		{ sphere: "wirtschaftlich" as const, cents: -52000 },
	];

	const kategorien = [
		{ name: "Materialaufwand", cents: 432000 },
		{ name: "Miete Vereinsheim", cents: 312000 },
		{ name: "Versicherungen", cents: 156000 },
		{ name: "Veranstaltungen", cents: 132000 },
		{ name: "Bürobedarf", cents: 98000 },
		{ name: "Reisekosten", cents: 86000 },
		{ name: "Öffentlichkeitsarbeit", cents: 74000 },
		{ name: "Instandhaltung", cents: 64000 },
		{ name: "Bankgebühren", cents: 32000 },
		{ name: "Weiterbildung", cents: 28000 },
		{ name: "Porto & Versand", cents: 19000 },
		{ name: "Software-Lizenzen", cents: 15000 },
		{ name: "Kleinmaterial", cents: 9000 },
	];

	const beitragCumulative = [
		34845, 55752, 69690, 83628, 90597, 97566, 97566, 104535, 104535, 111504, 111504, 118473,
	];
	const beitragMembers = [5, 8, 10, 12, 13, 14, 14, 15, 15, 16, 16, 17];

	const euerEin = [
		{ name: "Mitgliedsbeiträge", cents: 840000 },
		{ name: "Spenden", cents: 525000 },
		{ name: "Öffentliche Zuschüsse", cents: 480000 },
		{ name: "Kursgebühren", cents: 312000 },
		{ name: "Veranstaltungserlöse", cents: 165000 },
		{ name: "Sponsoring & Werbung", cents: 98000 },
		{ name: "Zinsen", cents: 21000 },
	];
	const euerAus = [
		{ name: "Übungsleiter-Honorare", cents: 690000 },
		{ name: "Raummiete", cents: 420000 },
		{ name: "Material & Ausstattung", cents: 248000 },
		{ name: "Veranstaltungskosten", cents: 194000 },
		{ name: "Versicherungen", cents: 115000 },
		{ name: "Öffentlichkeitsarbeit", cents: 87000 },
		{ name: "Verwaltung & Büro", cents: 64000 },
		{ name: "Bankgebühren", cents: 18000 },
	];
	// A genuine Fehlbetrag year: real income categories summing BELOW the
	// expenses (16.560 € < 18.360 € → −1.800 €), so labels stay honest.
	const euerEinDeficit = [
		{ name: "Mitgliedsbeiträge", cents: 620000 },
		{ name: "Spenden", cents: 410000 },
		{ name: "Öffentliche Zuschüsse", cents: 380000 },
		{ name: "Kursgebühren", cents: 190000 },
		{ name: "Sponsoring & Werbung", cents: 56000 },
	];
	// Income categories for the green ranking (never expense names under a green bar).
	const kategorienEin = [
		{ name: "Mitgliedsbeiträge", cents: 840000 },
		{ name: "Spenden", cents: 525000 },
		{ name: "Öffentliche Zuschüsse", cents: 480000 },
		{ name: "Kursgebühren", cents: 312000 },
		{ name: "Veranstaltungserlöse", cents: 165000 },
		{ name: "Sponsoring", cents: 98000 },
		{ name: "Zinsen", cents: 21000 },
	];
</script>

{#snippet section(title: string, note: string, body: Snippet)}
	<section class="mb-12" data-testid="gallery-section">
		<div class="mb-4 border-b border-(--hairline) pb-2">
			<h2 class="text-lg font-bold text-ink-900">{title}</h2>
			<p class="mt-0.5 text-sm text-ink-500">{note}</p>
		</div>
		{@render body()}
	</section>
{/snippet}

{#snippet card(inner: Snippet, label?: string)}
	<div class="rounded-2xl border border-(--hairline) bg-card p-5 shadow-(--shadow-card)">
		{#if label}<p class="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-300">{label}</p>{/if}
		{@render inner()}
	</div>
{/snippet}

<!-- `relative` gives the chart sr-only <table> twins a positioned ancestor INSIDE
     the AdminShell scroller. Without it the sr-only tables (position:absolute from
     the utility) anchor to <body>, sit at their deep static Y, and grow the document
     past the shell — leaving empty wash behind the main scroller. -->
<div class="relative">
	<header class="mb-10">
		<p class="text-[11px] font-bold uppercase tracking-[0.1em] text-primary-text">Aurora · Dataviz</p>
		<h1 class="mt-1 text-2xl font-extrabold text-ink-900">Chart-Familie · Galerie</h1>
		<p class="mt-1 text-sm text-ink-500">Die neun gelockten Katalog-Formen mit Demo-Daten. Nur im Dev-Build. Light + Dark umschalten (Einstellungen → Darstellung).</p>
	</header>

	{#snippet saldoBody()}
		<div class="flex flex-col gap-5">
			{@render card(saldoGrowthInner, "Wachstum · Desktop-Hover")}
			{@render card(saldoDeficitInner, "Defizit-Variante")}
		</div>
	{/snippet}
	{#snippet saldoGrowthInner()}<SaldoVerlauf monthlyCents={saldoGrowth} openingCents={1118000} year={YEAR} />{/snippet}
	{#snippet saldoDeficitInner()}<SaldoVerlauf monthlyCents={saldoDeficit} openingCents={340000} year={YEAR} />{/snippet}
	{@render section("1 · Saldo-Verlauf", "Trend — Hero-Zahl + achsenlose Sparkline. Desktop-Hover rastet auf den Monat.", saldoBody)}

	{#snippet cashflowBody()}{@render card(cashflowInner)}{/snippet}
	{#snippet cashflowInner()}<Cashflow months={cashflow} year={YEAR} />{/snippet}
	{@render section("2 · Cashflow", "Divergierende Balken um eine Nulllinie + neutrale Netto-Linie.", cashflowBody)}

	{#snippet sphaerenBody()}
		<div class="flex flex-col gap-5">
			{@render card(sphaerenInner, "Sortierte Balken")}
			{@render card(sphaerenDefInner, "Defizit links der Null")}
			{@render card(sphaerenDenseInner, "Dense (Dashboard-Mini)")}
		</div>
	{/snippet}
	{#snippet sphaerenInner()}<SphaerenBars rows={sphaeren} />{/snippet}
	{#snippet sphaerenDefInner()}<SphaerenBars rows={sphaerenDeficit} />{/snippet}
	{#snippet sphaerenDenseInner()}<SphaerenBars rows={sphaerenDeficit} dense />{/snippet}
	{@render section("3 · Sphären-Komposition", "Teil-vom-Ganzen — vier Sphären-Hues, Betrag + Anteil direkt.", sphaerenBody)}

	{#snippet katBody()}
		<div class="flex flex-col gap-5">
			{@render card(katAusInner, "Ausgaben (rosé)")}
			{@render card(katEinInner, "Einnahmen (grün)")}
		</div>
	{/snippet}
	{#snippet katAusInner()}<KategorienRanking items={kategorien} hue="ausgabe" />{/snippet}
	{#snippet katEinInner()}<KategorienRanking items={kategorienEin} hue="einnahme" />{/snippet}
	{@render section("4 · Top-Posten Ranking", "Rangliste — eine Farbe, Sonstige gebündelt, statisch.", katBody)}

	{#snippet freiBody()}
		<div class="flex flex-col gap-5">
			{@render card(freiSafeInner, "Sicher")}
			{@render card(freiWarnInner, "Achtung")}
			{@render card(freiOverInner, "Steuerpflichtig")}
		</div>
	{/snippet}
	{#snippet freiSafeInner()}<FreigrenzeGauge umsatzCents={1575000} year={YEAR} />{/snippet}
	{#snippet freiWarnInner()}<FreigrenzeGauge umsatzCents={4200000} year={YEAR} />{/snippet}
	{#snippet freiOverInner()}<FreigrenzeGauge umsatzCents={5300000} year={YEAR} />{/snippet}
	{@render section("5 · Freigrenze §64", "Bogenmesser — ein Verhältnis gegen 50.000 €, immer sichtbar.", freiBody)}

	{#snippet beitragStatusBody()}<BeitraegeStatus sollCents={139380} eingegangenCents={97566} perMemberCents={6969} total={20} paid={{ count: 14, cents: 97566 }} open={{ count: 2, cents: 13938 }} over={{ count: 2, cents: 13938 }} exempt={{ count: 2, cents: 13938 }} />{/snippet}
	{@render section("6 · Beiträge-Status", "Ein Readout statt eines Diagramms — vier Zustände, segmentierter Meter.", beitragStatusBody)}

	{#snippet beitragVerlaufBody()}{@render card(beitragVerlaufInner)}{/snippet}
	{#snippet beitragVerlaufInner()}<BeitragVerlauf cumulativeCents={beitragCumulative} membersPaid={beitragMembers} targetCents={139380} totalMembers={20} year={YEAR} />{/snippet}
	{@render section("7 · Beitrags-Eingang", "Kumulierte Fläche zur Ziellinie — amber Lücke = offener Rest.", beitragVerlaufBody)}

	{#snippet euerBody()}
		<div class="flex flex-col gap-5">
			{@render card(euerSurplusInner, "Überschuss")}
			{@render card(euerDeficitInner, "Fehlbetrag (Ausgaben > Einnahmen)")}
		</div>
	{/snippet}
	{#snippet euerSurplusInner()}<EuerStruktur einnahmen={euerEin} ausgaben={euerAus} />{/snippet}
	{#snippet euerDeficitInner()}<EuerStruktur einnahmen={euerEinDeficit} ausgaben={euerAus} />{/snippet}
	{@render section("8 · EÜR-Ergebnis", "Zwei Blöcke auf einer €-Achse + Ergebnis-Streifen (Defizit-Flip).", euerBody)}

	{#snippet statBody()}
		<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			{@render card(tileSaldo)}
			{@render card(tileEuer)}
			{@render card(tileBeitrag)}
			{@render card(tileOffen)}
			{@render card(tileFrei)}
		</div>
	{/snippet}
	{#snippet tileSaldo()}
		<StatTile label="Saldo" href="/app/transaktionen" ctaLabel="Transaktionen">
			{#snippet value()}14.820<span class="text-lg font-semibold text-ink-500">,45 €</span>{/snippet}
			{#snippet sub()}Stand heute · 2 Konten{/snippet}
			{#snippet viz()}<MiniSparkline series={saldoGrowth} label="Saldo-Verlauf" />{/snippet}
		</StatTile>
	{/snippet}
	{#snippet tileEuer()}
		<StatTile label="EÜR-Ergebnis" href="/app/jahresabschluss" ctaLabel="Jahresabschluss" chip={{ label: "+920 €", per: "ggü. Vorjahr", variant: "up" }}>
			{#snippet value()}<span style:color="var(--einnahme-strong)">+3.640 €</span>{/snippet}
			{#snippet sub()}Überschuss · Einnahmen − Ausgaben{/snippet}
			{#snippet viz()}<CompareBars einnahmenCents={1248000} ausgabenCents={884000} />{/snippet}
		</StatTile>
	{/snippet}
	{#snippet tileBeitrag()}
		<StatTile label="Beiträge-Quote" href="/app/mitglieder" ctaLabel="Mitglieder" chip={{ label: "3 offen", per: "900 € Rest", variant: "warn" }}>
			{#snippet value()}17<span class="text-lg font-semibold text-ink-300"> von 20</span>{/snippet}
			{#snippet sub()}Mitglieder haben gezahlt{/snippet}
			{#snippet viz()}<div class="flex items-center justify-between gap-3"><div><span class="block text-lg font-extrabold tabular-nums" style:color="var(--einnahme-strong)">5.100 €</span><span class="text-[11px] text-ink-500">von 6.000 € Soll</span></div><ProgressRing value={17} total={20} /></div>{/snippet}
		</StatTile>
	{/snippet}
	{#snippet tileOffen()}
		<StatTile label="Offene Forderungen" href="/app/ausgaben" ctaLabel="Überweisungen" chip={{ label: "überfällig", per: "8 Tage über Frist", variant: "crit" }}>
			{#snippet value()}270 €{/snippet}
			{#snippet sub()}<b>3</b> Rechnungen offen{/snippet}
			{#snippet viz()}<AgingRail daysOld={38} fristDays={30} />{/snippet}
		</StatTile>
	{/snippet}
	{#snippet tileFrei()}
		<StatTile label="Freigrenze §64" href="/app/jahresabschluss" ctaLabel="§64-Übersicht" chip={{ label: "viel Luft", per: "noch 36.050 € frei", variant: "good" }}>
			{#snippet value()}28 %{/snippet}
			{#snippet sub()}<b>13.950 €</b> von 50.000 € genutzt{/snippet}
			{#snippet viz()}<ZoneMeter valueCents={1395000} capCents={5000000} />{/snippet}
		</StatTile>
	{/snippet}
	{@render section("9 · Stat-Tiles", "Dashboard-Kennzahlen — jede Kachel trägt die passende Mini-Viz.", statBody)}
</div>

<script lang="ts">
	import type { EurWorkspaceData } from '$lib/server/eur/load.js';
	import SphereYoYTable from './SphereYoYTable.svelte';
	import MonthlyTrendStrip from './MonthlyTrendStrip.svelte';
	import WgbStatusCard from './WgbStatusCard.svelte';
	import PreFlightChecklist from './PreFlightChecklist.svelte';
	import FestschreibungConfirm from './FestschreibungConfirm.svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	interface Props {
		data: EurWorkspaceData;
		form?: { success?: boolean; error?: string; year?: number; totalRows?: number } | null;
	}

	let { data, form = null }: Props = $props();
</script>

<!-- Action feedback -->
{#if form?.success}
	<div
		class="mb-5 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
			<polyline points="22 4 12 14.01 9 11.01" />
		</svg>
		Jahresabschluss {form.year} erfolgreich festgeschrieben — {form.totalRows} Buchung{form.totalRows ===
		1
			? ''
			: 'en'} gesichert.
	</div>
{/if}

{#if form?.error}
	<div
		class="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
	>
		{form.error}
	</div>
{/if}

<!-- Quick-action row: PDF + CSV directly under header (UI-002 fix) -->
<div
	data-testid="uebersicht-quick-actions"
	class="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-sm"
>
	<div class="flex-1 min-w-0">
		<h2 class="text-sm font-semibold text-foreground">Schnell-Aktionen</h2>
		<p class="mt-0.5 text-xs text-muted-foreground">
			Prüfungs-relevante Ausgabe für Steuerberater und Vorstand.
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<Button
			href={`/app/jahresabschluss/${data.year}/bundle.zip`}
			data-testid="quick-action-pdf"
			variant="default"
			class="bg-[#9c2870] text-white hover:bg-[#7c2058]"
		>
			PDF drucken (EÜR)
		</Button>
		<Button
			href={`/app/jahresabschluss/${data.year}/bundle.zip`}
			data-testid="quick-action-csv"
			variant="outline"
		>
			CSV exportieren
		</Button>
	</div>
</div>

<!-- 2-column grid: Sphere YoY (wide) + Right-rail (WGB + trend) -->
<div class="grid grid-cols-1 gap-5 lg:grid-cols-3">
	<div class="lg:col-span-2 space-y-5">
		<SphereYoYTable
			rows={data.sphereYoY}
			year={data.year}
			priorYear={data.priorYear}
			totalEinnahmenCents={data.eur.totalEinnahmenCents}
			totalAusgabenCents={data.eur.totalAusgabenCents}
			totalUeberschussCents={data.eur.totalUeberschussCents}
			priorTotalUeberschussCents={data.priorEur.totalUeberschussCents}
		/>

		<MonthlyTrendStrip monthlyOverschuss={data.monthlyOverschuss} year={data.year} />
	</div>

	<div class="space-y-5">
		<WgbStatusCard wgb={data.wgb} />
		<PreFlightChecklist preFlight={data.preFlight} />
		<FestschreibungConfirm
			year={data.year}
			closed={data.closed}
			canFestschreiben={data.preFlight.canFestschreiben}
			blockerCount={data.preFlight.blockers}
		/>
	</div>
</div>

<!-- Legal note (kept from legacy EurSummary, slightly trimmed) -->
<div
	class="mt-6 rounded-xl border border-border/60 bg-muted/30 px-5 py-4 text-xs text-muted-foreground"
>
	Ideeller Bereich, Vermögensverwaltung und Zweckbetrieb sind steuerfrei. Wirtschaftlicher
	Geschäftsbetrieb ist steuerfrei unterhalb der Freigrenze von 50.000 €
	(§ 64 Abs. 3 AO i.V.m. JStG 2024, gültig ab 01.01.2025).
</div>

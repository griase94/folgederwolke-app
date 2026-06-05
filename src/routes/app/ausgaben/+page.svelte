<script lang="ts">
	/**
	 * /app/ausgaben — Ausgaben list page (Phase 4, Tier C1).
	 *
	 * Binds the shared (generic) `TransactionListScaffold` to the Ausgaben row type
	 * (`AusgabenRow`) with: an `AusgabenKpi` header pill snippet, the Ausgaben
	 * `columns` (Datum, ID mono, Bezeichnung + Bezahlt-von subtitle, Bezahlt von,
	 * Kategorie, the §13 Sphäre LEFT COLOR-RULE — a thin tone bar, not a filled
	 * badge —, Betrag right via Money, Status badge, chevron), and the bulk
	 * action wiring (BulkActionsBar + SEPA + post-SEPA modals — Task 3).
	 */
	import TransactionListScaffold from '$lib/components/admin/transactions/TransactionListScaffold.svelte';
	import AusgabenKpi from '$lib/components/admin/transactions/ausgaben/AusgabenKpi.svelte';
	import { ausgabenColumns } from '$lib/components/admin/transactions/ausgaben/columns.js';
	import Money from '$lib/components/ui/money/money.svelte';
	import type { Sphere } from '$lib/domain/sphere.js';
	import { SPHERE_LABELS } from '$lib/domain/sphere.js';
	import type { AusgabenRow } from '$lib/server/domain/transactions.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// ── Sphäre LEFT color-rule (§13) ──────────────────────────────────────────
	// A thin vertical tone bar keyed on the row's sphere — NOT the filled
	// SphereBadge (that lives on the detail page). Mirrors the §13 palette (the
	// solid tone of each Sphäre) so the list stays calm (a quiet left edge) while
	// the four Sphären stay legible.
	const SPHERE_RULE: Record<Sphere, string> = {
		ideeller: 'bg-pink-400 dark:bg-pink-500',
		vermoegen: 'bg-blue-400 dark:bg-blue-500',
		zweckbetrieb: 'bg-violet-400 dark:bg-violet-500',
		wirtschaftlich: 'bg-amber-400 dark:bg-amber-500',
	};

	function ruleFor(sphere: string): string {
		return SPHERE_RULE[sphere as Sphere] ?? 'bg-border';
	}

	function sphereLabel(sphere: string): string {
		return SPHERE_LABELS[sphere as Sphere] ?? sphere;
	}

	// ── Status badge ─────────────────────────────────────────────────────────
	const STATUS_LABEL: Record<string, string> = {
		zu_pruefen: 'Zu prüfen',
		in_pruefung: 'In Prüfung',
		geprueft: 'Genehmigt',
		abgelehnt: 'Abgelehnt',
		erstattet: 'Erstattet',
		importiert: 'Importiert',
	};
	const STATUS_TONE: Record<string, string> = {
		erstattet: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
		geprueft: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
		abgelehnt: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
	};
	function statusTone(status: string): string {
		return STATUS_TONE[status] ?? 'bg-muted text-muted-foreground';
	}

	function formatDatum(iso: string): string {
		return new Date(iso).toLocaleDateString('de-DE');
	}

	const columns = ausgabenColumns({
		datum: datumCell,
		id: idCell,
		bezeichnung: bezeichnungCell,
		bezahltVon: bezahltVonCell,
		kategorie: kategorieCell,
		sphaere: sphaereCell,
		betrag: betragCell,
		status: statusCell,
		chevron: chevronCell,
	});
</script>

<svelte:head>
	<title>Ausgaben – Folge der Wolke</title>
</svelte:head>

<!-- ── KPI header strip ────────────────────────────────────────────────────── -->
{#snippet kpi()}
	<AusgabenKpi
		totalCents={data.kpi.totalCents}
		count={data.kpi.count}
		offenCount={data.kpi.offenCount}
		oldestOpenAgeDays={data.kpi.oldestOpenAgeDays}
		year={data.yearScope}
	/>
{/snippet}

<!-- ── Column cells (typed on AusgabenRow — no casts) ──────────────────────── -->
{#snippet sphaereCell(row: AusgabenRow)}
	<span
		data-testid="sphaere-rule"
		data-sphere={row.sphereSnapshot}
		aria-label={sphereLabel(row.sphereSnapshot)}
		title={sphereLabel(row.sphereSnapshot)}
		class={['block h-6 w-1 rounded-full', ruleFor(row.sphereSnapshot)].join(' ')}
	></span>
{/snippet}

{#snippet datumCell(row: AusgabenRow)}
	<span class="whitespace-nowrap text-muted-foreground">{formatDatum(row.gebuchtAm)}</span>
{/snippet}

{#snippet idCell(row: AusgabenRow)}
	<span class="font-mono text-xs text-muted-foreground">{row.businessId}</span>
{/snippet}

{#snippet bezeichnungCell(row: AusgabenRow)}
	<span class="font-medium text-foreground">{row.bezeichnung}</span>
	{#if row.bezahltVonDisplay}
		<span class="mt-0.5 block text-xs text-muted-foreground">{row.bezahltVonDisplay}</span>
	{/if}
{/snippet}

{#snippet bezahltVonCell(row: AusgabenRow)}
	<span class="text-muted-foreground">{row.bezahltVonDisplay}</span>
{/snippet}

{#snippet kategorieCell(row: AusgabenRow)}
	<span class="text-muted-foreground">{row.kategorieNameSnapshot}</span>
{/snippet}

{#snippet betragCell(row: AusgabenRow)}
	<Money valueInCents={-row.betragCents} class="whitespace-nowrap font-medium" />
{/snippet}

{#snippet statusCell(row: AusgabenRow)}
	<span
		class={[
			'inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium',
			statusTone(row.status),
		].join(' ')}
	>
		{STATUS_LABEL[row.status] ?? row.status}
	</span>
{/snippet}

{#snippet chevronCell(_row: AusgabenRow)}
	<span aria-hidden="true" class="text-muted-foreground">›</span>
{/snippet}

<div class="container mx-auto max-w-6xl px-4 py-8 sm:px-6">
	<TransactionListScaffold
		tab="ausgaben"
		rows={data.rows}
		total={data.total}
		page={data.page}
		pageSize={data.pageSize}
		selectedYear={data.yearScope}
		currentYear={data.currentYear}
		filterState={data.filterState}
		kategorieOptions={data.kategorieOptions}
		memberOptions={data.memberOptions}
		{columns}
		{kpi}
		detailHrefBase="/app/ausgaben"
		newLabel="Neue Ausgabe"
		newHref="/app/ausgaben/neu"
	/>
</div>

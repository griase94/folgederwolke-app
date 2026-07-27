<!--
	BuchungslisteTab — the flat, sortable, filterable ledger behind the EÜR
	(D-Flow §2.3, plate buchungsliste-v1). „Zeig mir, woraus die 24.410 €
	bestehen." A read tool: no loud primary action.

	  · Toolbar: Art-Chips (Counts eingebacken) + Sphäre/Kategorie/Projekt-Selects
	    (inkl. „(ohne Kategorie)" — Ziel des Pre-Flight-#1-Links) + Count-Readout
	    + CSV-Ghost (ganzes Jahr, nie die Filter-Sicht — D4a).
	  · Sticky SortHeader (Datum ▾ · Betrag ▾) auf demselben Lineal wie die Zeilen.
	  · Ledger-Zeilen: Glyph · Bezeichnung + Kategorie-Meta · Beleg-Nr · Datum ·
	    Sphäre · Beleg-Chip · Betrag (typ-farbig). Ganze Zeile → Detail (Flow B).
	  · Fuß: Summe der Sicht; ungefiltert = sichtbare Kreuzprobe zur EÜR.
	  · Cap 2000 ehrlich ausgewiesen; „CSV enthält alles."
-->
<script lang="ts" module>
	import type {
		BuchungslisteFilters,
		BuchungslisteRow
	} from '$lib/server/eur/buchungsliste.js';

	export interface KindCounts {
		all: number;
		income: number;
		expense: number;
		donation: number;
	}

	export interface BuchungslisteTabProps {
		year: number;
		filters: BuchungslisteFilters;
		rows: BuchungslisteRow[];
		allRowsCount: number;
		kindCounts: KindCounts;
		/** EÜR-Überschuss (cents) — the unfiltered feed-foot matches it only in a
		 *  beitrag-free year (Kreuzprobe ✓). */
		ueberschussCents: number;
		/** Paid Mitgliedsbeiträge folded into the EÜR (single source from the EÜR
		 *  composer). The feed excludes them; foot + this == EÜR-Überschuss. */
		beitragEinnahmenCents: number;
		kategorien: { id: string; name: string }[];
		projects: { id: string; name: string }[];
		closed?: boolean;
	}

	/** listTransaktionenFeedPage cap — mirrored in the load; the honest cap line
	    fires when the year fills it. */
	const FEED_CAP = 2000;

	const SPHERE_LABELS: Record<string, string> = {
		ideeller: 'Ideeller Bereich',
		vermoegen: 'Vermögensverwaltung',
		zweckbetrieb: 'Zweckbetrieb',
		wirtschaftlich: 'Wirtschaftlicher Geschäftsbetrieb'
	};

	const KIND_TAB: Record<'income' | 'expense' | 'donation', string> = {
		income: 'einnahmen',
		expense: 'ausgaben',
		donation: 'spenden'
	};
</script>

<script lang="ts">
	import { formatCentsAsEuro } from '$lib/domain/money.js';
	import SortHeader, { type SortColumn, type SortDir } from './SortHeader.svelte';
	import { EmptyState } from '$lib/components/ui/empty-state/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import Lock from '@lucide/svelte/icons/lock';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileCheck from '@lucide/svelte/icons/file-check';
	import Download from '@lucide/svelte/icons/download';
	import Plus from '@lucide/svelte/icons/plus';
	import Minus from '@lucide/svelte/icons/minus';
	import HeartHandshake from '@lucide/svelte/icons/heart-handshake';

	let {
		year,
		filters,
		rows,
		allRowsCount,
		kindCounts,
		ueberschussCents,
		beitragEinnahmenCents,
		kategorien,
		projects,
		closed = false
	}: BuchungslisteTabProps = $props();

	const eur = (c: number) => formatCentsAsEuro(BigInt(Math.round(c)));

	const filtersActive = $derived(
		filters.sphere !== 'all' ||
			filters.kind !== 'all' ||
			!!filters.kategorieId ||
			!!filters.uncategorizedOnly ||
			!!filters.projectId
	);

	const base = $derived(`/app/jahresabschluss/${year}/buchungsliste`);

	function hrefWith(overrides: Record<string, string | undefined>): string {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder, not reactive state
		const params = new URLSearchParams();
		if (filters.sphere !== 'all') params.set('sphere', filters.sphere);
		if (filters.kind !== 'all') params.set('kind', filters.kind);
		if (filters.uncategorizedOnly) params.set('kategorie', 'ohne');
		else if (filters.kategorieId) params.set('kategorie', filters.kategorieId);
		if (filters.projectId) params.set('project', filters.projectId);
		if (filters.sort !== 'date-desc') params.set('sort', filters.sort);
		for (const [k, v] of Object.entries(overrides)) {
			if (v === undefined || v === '' || v === 'all' || v === 'date-desc') params.delete(k);
			else params.set(k, v);
		}
		const q = params.toString();
		return `${base}${q ? '?' + q : ''}`;
	}

	// ── Sort (SortHeader → sort param) ────────────────────────────────────────
	const sortColumns: SortColumn[] = [
		{ key: 'buchung', label: 'Buchung', sortable: false },
		{ key: 'bnr', label: 'Beleg-Nr', sortable: false },
		{ key: 'datum', label: 'Datum', sortable: true },
		{ key: 'sphaere', label: 'Sphäre', sortable: false },
		{ key: 'beleg', label: 'Beleg', sortable: false },
		{ key: 'betrag', label: 'Betrag', sortable: true, num: true },
		{ key: 'chev', label: '', sortable: false }
	];
	const LEDGER_COLS = 'minmax(0, 1fr) 112px 104px 148px 66px 128px 22px';

	const activeSortKey = $derived(filters.sort.startsWith('betrag') ? 'betrag' : 'datum');
	const activeSortDir = $derived<SortDir>(filters.sort.endsWith('asc') ? 'asc' : 'desc');
	function sortHref(key: string, dir: SortDir): string {
		const sort = key === 'betrag' ? `betrag-${dir}` : `date-${dir}`;
		return hrefWith({ sort });
	}

	// ── Foot sum (client-side over the filtered view) ─────────────────────────
	// The Buchungsliste is the TRANSACTION feed (income ∪ expense ∪ donation) —
	// it does NOT carry Mitgliedsbeiträge. The EÜR-Überschuss additionally
	// includes paid Mitgliedsbeiträge, so the feed-saldo equals the EÜR ONLY in a
	// year without paid Beiträge. We show the ✓-Kreuzprobe when they truly match,
	// and otherwise state the honest Mitgliedsbeitrags-delta (never a false ✓).
	const footSum = $derived(
		rows.reduce((a, r) => a + (r.kind === 'expense' ? -r.betragCents : r.betragCents), 0)
	);
	// ✓ only when the feed-saldo TRULY equals the EÜR (beitrag-free year).
	const kreuzOk = $derived(
		!filtersActive && beitragEinnahmenCents === 0 && footSum === ueberschussCents
	);
	// The Mitgliedsbeitrag component is the SINGLE-SOURCE value from the EÜR
	// composer (not `EÜR − feed`, which couldn't catch a feed/EÜR mismatch). The
	// identity `footSum + beitragEinnahmenCents === ueberschussCents` is asserted
	// by the @aurora-impl-d-abschluss e2e.
	const showBeitragNote = $derived(!filtersActive && beitragEinnahmenCents > 0);
	const capReached = $derived(allRowsCount >= FEED_CAP);

	function formatDate(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}
	function detailHref(r: BuchungslisteRow): string {
		return `/app/${KIND_TAB[r.kind] ?? 'ausgaben'}/${r.id}`;
	}

	const artChips = $derived([
		{ kind: 'all', label: 'Alle', count: kindCounts.all },
		{ kind: 'income', label: 'Einnahmen', count: kindCounts.income },
		{ kind: 'expense', label: 'Ausgaben', count: kindCounts.expense },
		{ kind: 'donation', label: 'Spenden', count: kindCounts.donation }
	]);

	// Current select values (for the GET form). "" = Alle.
	const kategorieValue = $derived(
		filters.uncategorizedOnly ? 'ohne' : (filters.kategorieId ?? '')
	);
</script>

<svelte:head>
	<title>Buchungsliste {year} – Jahresabschluss</title>
</svelte:head>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<div class="space-y-4">
	<!-- Toolbar -->
	<div class="toolbar" data-testid="buchungsliste-filters">
		<!-- Art chips (counts baked in) -->
		<div class="art-chips" role="group" aria-label="Nach Art filtern">
			{#each artChips as c (c.kind)}
				{@const active = filters.kind === c.kind || (c.kind === 'all' && filters.kind === 'all')}
				<a
					href={hrefWith({ kind: c.kind })}
					class="chip"
					data-active={active}
					data-testid={c.kind === 'all' ? 'filter-kind-all' : `filter-kind-${c.kind}`}
					aria-current={active ? 'true' : undefined}
				>
					{c.label}
					<span class="cnt">{c.count}</span>
				</a>
			{/each}
		</div>

		<!-- Selects: Sphäre · Kategorie · Projekt (GET form, auto-submit) -->
		<form method="GET" action={base} class="selects" data-testid="buchungsliste-selects">
			{#if filters.kind !== 'all'}<input type="hidden" name="kind" value={filters.kind} />{/if}
			{#if filters.sort !== 'date-desc'}<input type="hidden" name="sort" value={filters.sort} />{/if}

			<label class="sel">
				<span class="sel-lbl">Sphäre</span>
				<select
					name="sphere"
					value={filters.sphere === 'all' ? '' : filters.sphere}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
					data-testid="filter-sphere-select"
				>
					<option value="">Alle Sphären</option>
					{#each ['ideeller', 'vermoegen', 'zweckbetrieb', 'wirtschaftlich'] as s (s)}
						<option value={s}>{SPHERE_LABELS[s]}</option>
					{/each}
				</select>
			</label>

			<label class="sel">
				<span class="sel-lbl">Kategorie</span>
				<select
					name="kategorie"
					value={kategorieValue}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
					data-testid="filter-kategorie-select"
				>
					<option value="">Alle Kategorien</option>
					<option value="ohne">(ohne Kategorie)</option>
					{#each kategorien as k (k.id)}
						<option value={k.id}>{k.name}</option>
					{/each}
				</select>
			</label>

			<label class="sel">
				<span class="sel-lbl">Projekt</span>
				<select
					name="project"
					value={filters.projectId ?? ''}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
					data-testid="filter-project-select"
				>
					<option value="">Alle Projekte</option>
					{#each projects as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</label>
		</form>

		<!-- Count readout + reset + CSV ghost -->
		<div class="toolfoot">
			<span class="count" data-testid="buchungsliste-count" aria-live="polite">
				{#if filtersActive}
					{rows.length} von {allRowsCount} Buchungen
				{:else}
					{allRowsCount} Buchungen
				{/if}
			</span>
			<div class="tf-actions">
				{#if filtersActive}
					<a href={base} class="reset" data-testid="filter-reset">Zurücksetzen</a>
				{/if}
				<a
					href={`/app/jahresabschluss/${year}/transactions.csv`}
					class="csv-ghost"
					data-testid="csv-ghost"
					data-sveltekit-reload
				>
					<Download class="size-[15px]" aria-hidden="true" />
					CSV
				</a>
			</div>
		</div>
		<p class="csv-hint">CSV enthält das ganze Jahr {year} — unabhängig von den Filtern.</p>
	</div>

	<!-- Ledger -->
	{#if rows.length === 0}
		{#if filtersActive}
			<EmptyState
				data-testid="buchungsliste-empty-filtered"
				title="Keine Buchungen für diese Filter"
				description="Lockere die Filter oder setze sie zurück."
			>
				{#snippet cta()}
					<Button href={base} variant="outline">Filter zurücksetzen</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<EmptyState
				data-testid="buchungsliste-empty-new-year"
				title={`${year} hat noch keine Buchungen`}
				description={closed
					? `Das Buchungsjahr ${year} ist festgeschrieben.`
					: 'Lege die erste Einnahme, Ausgabe oder Spende an.'}
			>
				{#snippet cta()}
					{#if !closed}
						<Button href="/app/ausgaben/neu" variant="default">Erste Buchung anlegen</Button>
					{/if}
				{/snippet}
			</EmptyState>
		{/if}
	{:else}
		<div class="ledger" data-testid="buchungsliste-table">
			<SortHeader
				columns={sortColumns}
				cols={LEDGER_COLS}
				activeKey={activeSortKey}
				activeDir={activeSortDir}
				hrefFor={sortHref}
			/>
			<div class="rows">
				{#each rows as r (r.id)}
					{@const isEin = r.kind === 'income'}
					{@const isSpe = r.kind === 'donation'}
					<a
						class="lrow"
						style={`--cols: ${LEDGER_COLS}`}
						href={detailHref(r)}
						data-testid="buchungsliste-row"
						data-row-id={r.id}
					>
						<span class="cell buchung">
							<span class="glyph {isEin ? 'g-ein' : isSpe ? 'g-spe' : 'g-aus'}" aria-hidden="true">
								{#if isEin}<Plus class="size-3.5" />{:else if isSpe}<HeartHandshake
										class="size-3.5"
									/>{:else}<Minus class="size-3.5" />{/if}
							</span>
							<span class="b-txt">
								<span class="b-name">{r.bezeichnung}</span>
								<span class="b-meta">
									{r.kategorieNameSnapshot || 'Ohne Kategorie'}
									{#if r.festgeschriebenAt}
										<Lock class="inline-lock size-3" aria-hidden="true" />
									{/if}
								</span>
							</span>
						</span>
						<span class="cell bnr"><span class="id-chip">{r.businessId}</span></span>
						<span class="cell datum tabular">{formatDate(r.gebuchtAm)}</span>
						<span class="cell sphaere">
							<span class="sb" style={`background:var(--sphere-${r.sphereSnapshot})`}></span>
							<span class="sph-txt">{SPHERE_LABELS[r.sphereSnapshot] ?? r.sphereSnapshot}</span>
						</span>
						<span class="cell beleg">
							{#if r.hasBeleg}
								<span class="bc bc-have" title="Beleg hinterlegt">
									<FileCheck class="size-3.5" aria-hidden="true" />
								</span>
							{:else}
								<span class="bc bc-none" aria-hidden="true">–</span>
							{/if}
						</span>
						<span
							class="cell betrag tabular"
							class:ein={isEin}
							class:spe={isSpe}
							class:aus={r.kind === 'expense'}
						>
							{r.kind === 'expense' ? '−' : ''}{eur(r.betragCents)}
						</span>
						<span class="cell chev" aria-hidden="true"><ChevronRight class="size-4" /></span>
					</a>
				{/each}
			</div>

			<!-- Cap line -->
			{#if capReached}
				<p class="cap-line" data-testid="cap-line">
					Zeige die ersten {FEED_CAP} Buchungen — die CSV enthält alles.
				</p>
			{/if}

			<!-- Foot -->
			<div class="lfoot" data-testid="buchungsliste-foot">
				<div class="lf-main">
					<span class="lf-lbl">
						{filtersActive ? 'Summe der Sicht' : 'Transaktions-Saldo'}
					</span>
					<span class="lf-amt tabular" class:ein={footSum >= 0} class:aus={footSum < 0}>
						{footSum < 0 ? '−' : ''}{eur(Math.abs(footSum))}
						{#if kreuzOk}<span class="lf-check" data-testid="foot-kreuzprobe">= EÜR ✓</span>{/if}
					</span>
				</div>
				{#if showBeitragNote}
					<!-- Honest reconciliation: the feed excludes Mitgliedsbeiträge, which the EÜR adds. -->
					<p class="lf-note" data-testid="foot-beitrag-note">
						+ {eur(beitragEinnahmenCents)} Mitgliedsbeiträge (nicht im Transaktions-Feed) =
						EÜR-Überschuss <b>{eur(ueberschussCents)}</b>
					</p>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	/* ── Toolbar ────────────────────────────────────────────────────────────── */
	.toolbar {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: var(--shadow-card);
		padding: 14px 16px;
	}
	.art-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 5px 12px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--card);
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ink-700);
		text-decoration: none;
		transition:
			border-color 0.12s,
			background 0.12s;
	}
	.chip:hover {
		background: var(--secondary);
	}
	.chip[data-active='true'] {
		border-color: color-mix(in srgb, var(--primary-text) 45%, transparent);
		background: color-mix(in srgb, var(--primary-text) 10%, transparent);
		color: var(--primary-text);
	}
	.chip .cnt {
		font-size: 11px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--ink-500);
	}
	.chip[data-active='true'] .cnt {
		color: var(--primary-text);
	}
	.selects {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 12px;
	}
	.sel {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.sel-lbl {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ink-500);
	}
	.sel select {
		min-width: 168px;
		max-width: 100%;
		padding: 7px 10px;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: var(--card);
		font-size: 13px;
		color: var(--ink-900);
	}
	.sel select:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--ring);
	}
	.toolfoot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--hairline);
	}
	.count {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ink-700);
		font-variant-numeric: tabular-nums;
	}
	.tf-actions {
		display: inline-flex;
		align-items: center;
		gap: 12px;
	}
	.reset {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--primary-text);
		text-decoration: none;
	}
	.reset:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.csv-ghost {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 11px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: transparent;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ink-700);
		text-decoration: none;
	}
	.csv-ghost:hover {
		background: var(--secondary);
	}
	.csv-hint {
		margin: 8px 0 0;
		font-size: 11px;
		color: var(--ink-500);
	}

	/* ── Ledger ─────────────────────────────────────────────────────────────── */
	.ledger {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}
	.rows {
		display: flex;
		flex-direction: column;
	}
	.lrow {
		display: grid;
		grid-template-columns: var(--cols);
		align-items: center;
		gap: 14px;
		padding: 11px 16px;
		border-top: 1px solid var(--hairline);
		text-decoration: none;
		color: var(--ink-900);
		transition: background 0.1s;
	}
	.lrow:hover {
		background: var(--secondary);
	}
	.cell {
		min-width: 0;
	}
	.buchung {
		display: flex;
		align-items: center;
		gap: 11px;
		min-width: 0;
	}
	.glyph {
		flex: none;
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
		border-radius: 8px;
	}
	.g-ein {
		background: var(--type-einnahme-tint);
		color: var(--type-einnahme);
	}
	.g-aus {
		background: color-mix(in srgb, var(--type-ausgabe) 12%, transparent);
		color: var(--type-ausgabe);
	}
	.g-spe {
		background: var(--sphere-ideeller-tint);
		color: var(--sphere-ideeller);
	}
	.b-txt {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.b-name {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ink-900);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.b-meta {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11.5px;
		color: var(--ink-500);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.b-meta :global(.inline-lock) {
		flex: none;
		color: var(--ink-500);
	}
	.id-chip {
		display: inline-block;
		padding: 2px 7px;
		border-radius: 6px;
		background: var(--secondary);
		font-size: 11px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--ink-700);
		white-space: nowrap;
	}
	.datum {
		font-size: 12.5px;
		color: var(--ink-700);
		white-space: nowrap;
	}
	.tabular {
		font-variant-numeric: tabular-nums;
	}
	.sphaere {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}
	.sb {
		width: 9px;
		height: 9px;
		flex: none;
		border-radius: 3px;
	}
	.sph-txt {
		font-size: 12px;
		color: var(--ink-700);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.beleg {
		display: flex;
		justify-content: center;
	}
	.bc {
		display: inline-grid;
		place-items: center;
	}
	.bc-have {
		width: 24px;
		height: 24px;
		border-radius: 7px;
		background: var(--type-einnahme-tint);
		color: var(--type-einnahme);
	}
	.bc-none {
		color: var(--ink-300);
		font-weight: 600;
	}
	.betrag {
		text-align: right;
		font-size: 13.5px;
		font-weight: 700;
		white-space: nowrap;
	}
	.betrag.ein {
		color: var(--type-einnahme);
	}
	.betrag.spe {
		color: var(--type-spende);
	}
	.betrag.aus {
		color: var(--type-ausgabe);
	}
	.chev {
		display: flex;
		justify-content: flex-end;
		color: var(--ink-300);
	}

	/* ── Cap + foot ─────────────────────────────────────────────────────────── */
	.cap-line {
		margin: 0;
		padding: 10px 16px;
		border-top: 1px solid var(--hairline);
		background: color-mix(in srgb, var(--sev-info) 7%, transparent);
		font-size: 12px;
		color: var(--ink-700);
	}
	.lfoot {
		padding: 13px 16px;
		border-top: 2px solid var(--border);
		background: var(--secondary);
	}
	.lf-main {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
	}
	.lf-note {
		margin: 8px 0 0;
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--ink-500);
	}
	.lf-note b {
		color: var(--type-einnahme);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.lf-lbl {
		font-size: 12.5px;
		font-weight: 700;
		color: var(--ink-900);
	}
	.lf-amt {
		font-size: 15px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}
	.lf-amt.ein {
		color: var(--type-einnahme);
	}
	.lf-amt.aus {
		color: var(--type-ausgabe);
	}
	.lf-check {
		margin-left: 6px;
		color: var(--type-einnahme);
		font-weight: 800;
	}

	/* ── Mobile: buchung + betrag on one row; rest hidden (S4 adds the sheet) ── */
	@media (max-width: 640px) {
		.ledger :global(.sorthead) {
			display: none;
		}
		.lrow {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 12px;
		}
		.bnr,
		.datum,
		.sphaere,
		.beleg,
		.chev {
			display: none;
		}
	}
</style>

<!--
	SpendenTab — the year's donations + Bescheinigungs-Status (D-Flow §2.4, plate
	ja-spenden-v1). „Welche Spenden hat 2025, welche haben schon eine Bestätigung,
	welche brauchen noch eine (besonders ≥ 300 €)?"

	FARB-REGEL (locked): ausstehend = --neutral-open, NIE amber. Amber trägt hier
	ausschließlich die echte ≥-300-€-Warnung (.flag-warn). B4-Carve-out: Ausstellen
	bleibt auch nach der Festschreibung möglich (mutiert nur Bescheinigungs-Spalten).
-->
<script lang="ts" module>
	import type { BescheinigungStatus } from '$lib/domain/bescheinigungs-status.js';
	import { KLEINBETRAG_THRESHOLD_CENTS } from '$lib/domain/bescheinigungs-status.js';

	export interface SpendeRowData {
		id: string;
		businessId: string;
		gebuchtAm: string;
		zugewendetAm: string | null;
		betragCents: number;
		spenderDisplay: string;
		spendeKind: string;
		bescheinigungNr: string | null;
		bescheinigungAusgestelltAm: string | null;
		sphereSnapshot: string;
		kategorieNameSnapshot: string;
		status: BescheinigungStatus;
	}

	export interface SpendenTabProps {
		year: number;
		rows: SpendeRowData[];
		totals: {
			count: number;
			issued: number;
			pending: number;
			na: number;
			totalCents: number;
		};
		bescheinigungEnabled: boolean;
		closed?: boolean;
	}

	const KIND_LABEL: Record<string, string> = {
		geldspende: 'Geldspende',
		sachspende: 'Sachspende',
		aufwandsspende: 'Aufwandsspende'
	};
</script>

<script lang="ts">
	import { formatCentsAsEuro } from '$lib/domain/money.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { EmptyState } from '$lib/components/ui/empty-state/index.js';
	import SegmentedMeter, { type MeterSegment } from './SegmentedMeter.svelte';
	import HeartHandshake from '@lucide/svelte/icons/heart-handshake';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Info from '@lucide/svelte/icons/info';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let { year, rows, totals, bescheinigungEnabled, closed = false }: SpendenTabProps = $props();

	const eur = (c: number) => formatCentsAsEuro(BigInt(Math.round(c)));

	function formatDate(iso: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
	}

	const segments = $derived<MeterSegment[]>([
		{ tone: 'ok', count: totals.issued, label: 'bescheinigt' },
		{ tone: 'open', count: totals.pending, label: 'ausstehend' },
		{ tone: 'neutral', count: totals.na, label: 'n. a.' }
	]);

	const allIssued = $derived(totals.count > 0 && totals.pending === 0 && totals.na === 0);
</script>

<svelte:head>
	<title>Spenden {year} – Jahresabschluss</title>
</svelte:head>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<div class="space-y-4">
	{#if !bescheinigungEnabled}
		<div class="callout info" role="status" data-testid="bescheinigung-disabled-callout">
			<Info class="size-4 flex-none" aria-hidden="true" />
			<p>Zuwendungsbestätigungen sind noch nicht freigeschaltet — hier stehen nur die Nummern-Fakten.</p>
		</div>
	{/if}

	{#if closed}
		<div class="callout info" role="status" data-testid="spenden-carveout-callout">
			<Info class="size-4 flex-none" aria-hidden="true" />
			<p>Bescheinigen ist auch nach dem Abschluss möglich — es ändert nur die Bescheinigungs-Spalten.</p>
		</div>
	{/if}

	{#if rows.length === 0}
		<EmptyState
			data-testid="spenden-empty"
			title={`${year} hatte keine Spenden`}
			description={closed
				? `Das Buchungsjahr ${year} ist festgeschrieben.`
				: 'Sobald Spenden eingegangen sind, erscheinen sie hier zur Bescheinigungs-Verwaltung.'}
		>
			{#snippet cta()}
				{#if !closed}
					<Button href="/app/spenden/neu">Spende erfassen</Button>
				{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<!-- Status-Meter + Summen -->
		<section class="panel" aria-labelledby="spenden-meter-head">
			<h2 id="spenden-meter-head" class="sr-only">Bescheinigungs-Status</h2>
			<SegmentedMeter {segments} />
			<p class="summary" data-testid="spenden-summary">
				<b>{totals.count}</b> Spende{totals.count === 1 ? '' : 'n'}
				· <b>{eur(totals.totalCents)}</b> gesamt
				· {totals.issued} bescheinigt
				· {totals.pending} ausstehend
				· {totals.na} n. a.
			</p>
			{#if allIssued}
				<p class="clean-note" data-testid="spenden-clean">Alle Bescheinigungen sind raus — sauber.</p>
			{/if}
		</section>

		<!-- Liste -->
		<div class="ledger" data-testid="spenden-table">
			{#each rows as r (r.id)}
				{@const ge300 = r.betragCents >= KLEINBETRAG_THRESHOLD_CENTS}
				{@const warnFlag = ge300 && r.status === 'pending'}
				<div class="srow" data-testid="spende-row" data-status={r.status}>
					<div class="srow-main">
						<span class="glyph g-spe" aria-hidden="true"><HeartHandshake class="size-4" /></span>
						<span class="spender">
							<span class="sp-nm" title={r.spenderDisplay}>{r.spenderDisplay}</span>
							<span class="sp-sub">{r.businessId}</span>
						</span>
						<span class="art-chip">{KIND_LABEL[r.spendeKind] ?? r.spendeKind}</span>
						<span class="date tabular">{formatDate(r.zugewendetAm ?? r.gebuchtAm)}</span>
						<span class="statusslot">
							{#if r.status === 'issued'}
								<span class="chip-status s-issued" data-testid="bescheinigungs-status-issued">
									{r.bescheinigungNr ? `${r.bescheinigungNr} · ` : ''}ausgestellt
								</span>
								<a class="slot-cta ghost" href={`/app/spenden/${r.id}`}>Anzeigen</a>
							{:else if r.status === 'pending'}
								<span class="chip-status s-open" data-testid="bescheinigungs-status-pending">ausstehend</span>
								{#if bescheinigungEnabled}
									<a class="slot-cta" href={`/app/spenden/${r.id}`} data-testid="bescheinigung-create-cta">
										Ausstellen <ArrowRight class="size-[14px]" aria-hidden="true" />
									</a>
								{/if}
							{:else}
								<span class="chip-status s-na" data-testid={`bescheinigungs-status-${r.status}`}>n. a.</span>
							{/if}
						</span>
						<span class="betrag tabular">{eur(r.betragCents)}</span>
					</div>
					{#if warnFlag}
						<div class="flag-warn" data-testid="flag-ge300">
							<TriangleAlert class="size-3.5 flex-none" aria-hidden="true" />
							<span>≥ 300 € — Bescheinigung vor dem Abschluss empfohlen.</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.callout {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 11px 14px;
		border-radius: 10px;
		font-size: 13px;
		line-height: 1.45;
	}
	.callout p {
		margin: 0;
	}
	.callout.info {
		border: 1px solid color-mix(in srgb, var(--sev-info) 35%, transparent);
		background: color-mix(in srgb, var(--sev-info) 9%, transparent);
		color: var(--ink-700);
	}
	.callout.info :global(svg) {
		color: var(--sev-info);
		margin-top: 1px;
	}

	.panel {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: var(--shadow-card);
		padding: 16px 18px;
	}
	.summary {
		margin: 12px 0 0;
		font-size: 13px;
		color: var(--ink-700);
		font-variant-numeric: tabular-nums;
	}
	.summary b {
		color: var(--ink-900);
		font-weight: 750;
	}
	.clean-note {
		margin: 8px 0 0;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--type-einnahme);
	}

	/* ── Ledger ─────────────────────────────────────────────────────────────── */
	.ledger {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: var(--shadow-card);
		overflow: hidden;
	}
	.srow {
		border-top: 1px solid var(--hairline);
	}
	.srow:first-child {
		border-top: none;
	}
	.srow-main {
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr) 118px 104px 200px 120px;
		align-items: center;
		gap: 14px;
		padding: 12px 16px;
	}
	.glyph {
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border-radius: 8px;
	}
	.g-spe {
		background: var(--type-spende-tint);
		color: var(--type-spende);
	}
	.spender {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.sp-nm {
		font-size: 13.5px;
		font-weight: 600;
		color: var(--ink-900);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.sp-sub {
		font-size: 11.5px;
		font-variant-numeric: tabular-nums;
		color: var(--ink-500);
	}
	.art-chip {
		justify-self: start;
		padding: 3px 9px;
		border-radius: 999px;
		background: var(--secondary);
		font-size: 11.5px;
		font-weight: 600;
		color: var(--ink-700);
		white-space: nowrap;
	}
	.date {
		font-size: 12.5px;
		color: var(--ink-700);
		white-space: nowrap;
	}
	.tabular {
		font-variant-numeric: tabular-nums;
	}
	/* fixed status slot — never flutters */
	.statusslot {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.chip-status {
		display: inline-flex;
		align-items: center;
		padding: 3px 9px;
		border-radius: 999px;
		font-size: 11.5px;
		font-weight: 600;
		white-space: nowrap;
	}
	.chip-status.s-issued {
		background: var(--type-einnahme-tint);
		color: var(--type-einnahme);
	}
	/* ausstehend = neutral-open, NEVER amber */
	.chip-status.s-open {
		background: var(--open-tint);
		color: color-mix(in oklch, var(--neutral-open), #000 42%);
	}
	.chip-status.s-na {
		background: var(--secondary);
		color: var(--ink-500);
	}
	.slot-cta {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12.5px;
		font-weight: 650;
		color: var(--primary-text);
		text-decoration: none;
		white-space: nowrap;
	}
	.slot-cta:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.slot-cta.ghost {
		color: var(--ink-500);
	}
	.betrag {
		text-align: right;
		font-size: 14px;
		font-weight: 700;
		color: var(--type-spende);
		white-space: nowrap;
	}
	/* ≥ 300 € warn flag — the ONE legit amber on this screen (text, not colour-only) */
	.flag-warn {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 16px 12px 64px;
		padding: 7px 11px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--sev-warn) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--sev-warn) 30%, transparent);
		font-size: 12px;
		font-weight: 600;
		color: var(--sev-warn-text);
	}

	@media (max-width: 640px) {
		.srow-main {
			grid-template-columns: 30px minmax(0, 1fr) auto;
			grid-template-areas:
				'glyph spender betrag'
				'meta meta meta'
				'status status status';
			gap: 6px 12px;
		}
		.glyph {
			grid-area: glyph;
		}
		.spender {
			grid-area: spender;
		}
		.betrag {
			grid-area: betrag;
		}
		.art-chip,
		.date {
			display: none;
		}
		.statusslot {
			grid-area: status;
		}
		.flag-warn {
			margin-left: 16px;
		}
	}
</style>

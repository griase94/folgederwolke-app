<script lang="ts">
	import { page } from '$app/state';
	import { enhance, applyAction } from '$app/forms';
	import PageShell from '$lib/components/layout/PageShell.svelte';
	import YearCard from '$lib/components/admin/jahresabschluss/YearCard.svelte';
	import FestschreibungModal from '$lib/components/admin/jahresabschluss/FestschreibungModal.svelte';
	import { formatCentsAsEuro } from '$lib/domain/money.js';
	import type { FactRow } from '$lib/components/ui/facts-table/index.js';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Lock from '@lucide/svelte/icons/lock';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Download from '@lucide/svelte/icons/download';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const eur = (c: number) => formatCentsAsEuro(BigInt(Math.round(c)));

	// The single festschreiben result (Hub-Settle) — captured client-side from
	// the canonical [year] action via enhance (no cross-route form typing).
	interface FestschreibenResult {
		success: boolean;
		year: number;
		totalRows: number;
		archived: number;
		archiveFailed: number;
		archiveTotal: number;
	}
	let settle = $state<FestschreibenResult | null>(null);
	let submitError = $state<string | null>(null);
	let submitting = $state(false);

	let modalOpen = $state(false);
	let confirmed = $state(false);

	const readyCard = $derived(data.years.find((y) => y.year === data.readyYear) ?? null);
	const pf = $derived(data.readyPreFlight);

	// Pre-flight → checklist items (shared PreFlightList shape).
	const readyItems = $derived(
		(pf?.items ?? []).map((it) => ({
			id: it.id,
			label: it.label,
			status: it.status,
			detail: it.detail,
			fixHref: it.fixHref
		}))
	);

	// Modal facts + warnings for the ready year.
	const modalFacts = $derived<FactRow[]>(
		readyCard
			? [
					{
						// The Festschreibung seals the TRANSACTION rows (income + expense +
						// donation) — close_buchhaltungsjahr stamps exactly those. NOT the
						// paid Mitgliedsbeiträge (they carry no festgeschrieben_at). Show that
						// count so the modal matches the Settle „N Buchungen gesichert" exactly
						// (Zahlengleichheit im heikelsten Moment); buchungszahl (4-source union)
						// would over-state by the Beiträge.
						label: 'Buchungen',
						value: String(
							readyCard.counts.einnahmen +
								readyCard.counts.ausgaben +
								readyCard.counts.spenden
						),
						variant: 'num'
					},
					{
						label: 'Einnahmen',
						value: eur(readyCard.einnahmenCents),
						variant: 'amount',
						tone: 'einnahme'
					},
					{
						label: 'Ausgaben',
						value: eur(readyCard.ausgabenCents),
						variant: 'amount',
						tone: 'ausgabe'
					},
					{ label: 'Überschuss', value: eur(readyCard.ueberschussCents), variant: 'amount' }
				]
			: []
	);
	const modalWarnings = $derived(
		(pf?.items ?? []).filter((i) => i.status === 'warn').map((i) => i.detail)
	);

	function openModal() {
		submitError = null;
		modalOpen = true;
	}
</script>

<svelte:head>
	<title>Jahresabschluss – {page.data.vereinName}</title>
</svelte:head>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<PageShell width="list">
	<div class="mb-5">
		<h1 class="text-2xl font-bold tracking-tight text-foreground">Jahresabschluss</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			EÜR pro Buchungsjahr — prüfen, festschreiben, an den Steuerberater übergeben.
		</p>
	</div>

	<!-- Success settle (Hub-Settle) -->
	{#if settle?.success}
		<div class="settle ok" role="status" data-testid="festschreiben-settle">
			<span class="s-ic"><CircleCheck class="size-5" aria-hidden="true" /></span>
			<div class="s-body">
				<div class="s-title">
					Buchungsjahr {settle.year} festgeschrieben — {settle.totalRows} Buchung{settle.totalRows ===
					1
						? ''
						: 'en'} gesichert.
				</div>
				{#if settle.archiveFailed > 0}
					<div class="s-warn">
						<TriangleAlert class="size-3.5 flex-none" aria-hidden="true" />
						{settle.archiveFailed} von {settle.archiveTotal} Belegen konnten nicht archiviert werden —
						<a href="/app/files">in den Dateien prüfen</a>.
					</div>
				{/if}
				<a class="s-cta" href={`/app/jahresabschluss/${settle.year}/exports`}>
					Steuerberater-Paket herunterladen <ArrowRight class="size-[15px]" aria-hidden="true" />
				</a>
			</div>
		</div>
	{/if}

	{#if submitError}
		<div class="settle crit" role="alert" data-testid="festschreiben-error">
			<TriangleAlert class="size-5 flex-none" aria-hidden="true" />
			<p>{submitError}</p>
		</div>
	{/if}

	<div class="stack">
		{#each data.years as y (y.year)}
			{#if y.closed}
				<YearCard
					state="locked"
					year={y.year}
					einnahmenCents={y.einnahmenCents}
					ausgabenCents={y.ausgabenCents}
					ueberschussCents={y.ueberschussCents}
					buchungszahl={y.buchungszahl}
					lockedMeta="festgeschrieben"
				>
					{#snippet actions()}
						<a
							class="zip-link"
							href={`/app/jahresabschluss/${y.year}/bundle.zip`}
							download={`Jahresabschluss-${y.year}.zip`}
							data-sveltekit-reload
						>
							<Download class="size-[14px]" aria-hidden="true" /> ZIP
						</a>
					{/snippet}
				</YearCard>
			{:else if y.year === data.readyYear}
				<YearCard
					state="ready"
					year={y.year}
					einnahmenCents={y.einnahmenCents}
					ausgabenCents={y.ausgabenCents}
					ueberschussCents={y.ueberschussCents}
					buchungszahl={y.buchungszahl}
					preFlightItems={readyItems}
					collapsePreFlight
					blocked={!pf?.canFestschreiben}
				>
					{#snippet consequence()}
						Nach dem Festschreiben sind die Zahlen von <b>{y.year}</b> unveränderbar (GoBD § 146).
					{/snippet}
					{#snippet cta()}
						{#if pf?.canFestschreiben}
							<button
								type="button"
								class="close-cta"
								onclick={openModal}
								data-testid="hub-festschreiben-open"
							>
								<Lock class="size-4" aria-hidden="true" />
								Jahr {y.year} festschreiben
							</button>
						{:else}
							<button
								type="button"
								class="close-cta is-blocked"
								disabled
								data-testid="hub-festschreiben-blocked"
							>
								<Lock class="size-4" aria-hidden="true" />
								{pf?.blockers ?? 0} Blocker offen — erst beheben
							</button>
						{/if}
					{/snippet}
				</YearCard>
			{:else if y.year === data.currentYear}
				<YearCard
					state="running"
					year={y.year}
					einnahmenCents={y.einnahmenCents}
					ausgabenCents={y.ausgabenCents}
					ueberschussCents={y.ueberschussCents}
					buchungszahl={y.buchungszahl}
					note={`${y.year} läuft noch — der Jahresabschluss ist ab Januar ${y.year + 1} möglich.`}
				>
					{#snippet actions()}
						<a class="open-link" href={`/app/jahresabschluss/${y.year}/uebersicht`}>
							Ansehen <ArrowRight class="size-[14px]" aria-hidden="true" />
						</a>
					{/snippet}
				</YearCard>
			{:else}
				<!-- Completed but not the ready year (older unclosed) — a calm open row. -->
				<a
					class="open-row"
					href={`/app/jahresabschluss/${y.year}/uebersicht`}
					data-testid="open-year-row"
				>
					<span class="or-year">{y.year}</span>
					<span class="or-status">offen</span>
					<span
						class="or-amt"
						class:ein={y.ueberschussCents >= 0}
						class:aus={y.ueberschussCents < 0}
					>
						{eur(y.ueberschussCents)}
					</span>
					<ArrowRight class="size-4 flex-none text-muted-foreground" aria-hidden="true" />
				</a>
			{/if}
		{/each}
	</div>
</PageShell>

<!-- Festschreibung modal (page-level; opened from the ready card) -->
{#if readyCard}
	<FestschreibungModal
		bind:open={modalOpen}
		bind:confirmed
		year={readyCard.year}
		facts={modalFacts}
		warnings={modalWarnings}
	>
		{#snippet cta()}
			<form
				method="POST"
				action={`/app/jahresabschluss/${readyCard.year}?/festschreiben`}
				use:enhance={() => {
					submitting = true;
					submitError = null;
					return async ({ result, update }) => {
						submitting = false;
						if (result.type === 'success') {
							settle = result.data as unknown as FestschreibenResult;
							modalOpen = false;
							confirmed = false;
							await update({ reset: false });
						} else if (result.type === 'failure') {
							submitError =
								(result.data?.error as string | undefined) ?? 'Festschreibung fehlgeschlagen.';
							modalOpen = false;
							confirmed = false;
							await update({ reset: false });
						} else {
							await applyAction(result);
						}
					};
				}}
				class="flex flex-1 flex-col"
			>
				<button
					type="submit"
					class="modal-submit"
					disabled={!confirmed || submitting}
					aria-busy={submitting}
					data-testid="hub-festschreiben-submit"
				>
					<Lock class="size-4" aria-hidden="true" />
					{submitting ? 'Wird festgeschrieben…' : `${readyCard.year} festschreiben`}
				</button>
			</form>
		{/snippet}
	</FestschreibungModal>
{/if}

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	/* Settle callouts */
	.settle {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 16px;
		padding: 14px 16px;
		border-radius: 12px;
		border: 1px solid;
	}
	.settle.ok {
		border-color: color-mix(in srgb, var(--type-einnahme) 32%, transparent);
		background: var(--type-einnahme-tint);
	}
	.settle.ok .s-ic {
		color: var(--type-einnahme);
		flex: none;
	}
	.settle.crit {
		border-color: color-mix(in srgb, var(--sev-critical) 35%, transparent);
		background: color-mix(in srgb, var(--sev-critical) 10%, transparent);
		color: var(--sev-critical-text);
	}
	.settle.crit p {
		margin: 0;
		font-size: 13.5px;
	}
	.s-title {
		font-size: 13.5px;
		font-weight: 700;
		color: var(--ink-900);
	}
	.s-warn {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
		font-size: 12.5px;
		color: var(--sev-warn-text);
	}
	.s-warn a {
		color: var(--primary-text);
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.s-cta {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 10px;
		font-size: 13px;
		font-weight: 700;
		color: var(--primary-text);
		text-decoration: none;
	}
	.s-cta:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	/* Close CTA (ready card foot) */
	.close-cta {
		display: inline-flex;
		width: 100%;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 11px 18px;
		border-radius: 10px;
		border: 0;
		background: var(--type-einnahme);
		color: #fff;
		font-size: 14px;
		font-weight: 700;
		cursor: pointer;
	}
	.close-cta:hover {
		background: color-mix(in srgb, var(--type-einnahme) 88%, #000);
	}
	.close-cta.is-blocked {
		background: var(--secondary);
		color: var(--ink-500);
		cursor: not-allowed;
	}
	.modal-submit {
		display: inline-flex;
		height: 40px;
		flex: 1;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border-radius: 8px;
		border: 0;
		background: var(--type-einnahme);
		color: #fff;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}
	.modal-submit:disabled {
		background: var(--secondary);
		color: var(--ink-500);
		cursor: not-allowed;
	}
	/* Locked ZIP + running Ansehen links */
	.zip-link,
	.open-link {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12.5px;
		font-weight: 650;
		color: var(--primary-text);
		text-decoration: none;
		white-space: nowrap;
	}
	.zip-link:hover,
	.open-link:hover {
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	/* Open-older compact row */
	.open-row {
		display: grid;
		grid-template-columns: 58px 1fr 116px auto;
		align-items: center;
		gap: 14px;
		padding: 13px 16px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--card);
		text-decoration: none;
	}
	.open-row:hover {
		background: var(--secondary);
	}
	.or-year {
		font-size: 15px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--ink-900);
	}
	.or-status {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--ink-500);
	}
	.or-amt {
		text-align: right;
		font-size: 14px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.or-amt.ein {
		color: var(--type-einnahme);
	}
	.or-amt.aus {
		color: var(--type-ausgabe);
	}
</style>

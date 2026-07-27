<script lang="ts">
	/**
	 * BeitragsverlaufList — per-year Beitrags-history for the Mitglied-Detail
	 * (mitglied-detail §1/§4, `.byear-row(.hero)`). One row per year since Eintritt:
	 * Jahr · BeitragCell status · Betrag/Rest · bezahlt-am · Notiz · Aktion.
	 *
	 * The current year is the `.hero` row: a status-coloured left accent + the ONE
	 * status-driven primary CTA ("Zahlung erfassen" for open/overdue, "Restbetrag
	 * erfassen" for partial). Locked years carry a lock and no mutation affordance.
	 * Read-by-default: the CTA delegates upward (onRecordPayment) — the dialog is
	 * wired at the screen level.
	 */
	import type { CellState } from '$lib/domain/beitrag-cell.js';
	import BeitragCell from './BeitragCell.svelte';

	export type BeitragsverlaufRow = {
		year: number;
		state: CellState;
		isLocked: boolean;
		betragCents: number;
		paidCents: number;
		gezahltAm: string | null;
		notes: string | null;
		exemptReason: string | null;
		daysOverdue?: number | null;
	};

	let {
		rows,
		currentYear,
		onRecordPayment,
		'data-testid': testId = 'beitragsverlauf'
	}: {
		rows: BeitragsverlaufRow[];
		currentYear: number;
		/** Opens the payment surface for a year (screen wires the dialog). */
		onRecordPayment?: (year: number) => void;
		'data-testid'?: string;
	} = $props();

	const eur = (cents: number) =>
		(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		const [y, m, d] = iso.split('-');
		return y && m && d ? `${d}.${m}.${y}` : '—';
	}

	const OWING = new Set<CellState>(['open', 'overdue', 'partial']);

	/** Status-driven CTA label, or null when there's nothing to record. */
	function ctaLabel(state: CellState): string | null {
		if (state === 'partial') return 'Restbetrag erfassen';
		if (state === 'open' || state === 'overdue') return 'Zahlung erfassen';
		return null;
	}

	/** Outstanding for owing rows (Soll − bezahlt). */
	function restCents(r: BeitragsverlaufRow): number {
		return Math.max(r.betragCents - r.paidCents, 0);
	}
</script>

<ul data-testid={testId} class="flex flex-col gap-1.5">
	{#each rows as row (row.year)}
		{@const isHero = row.year === currentYear}
		{@const label = row.isLocked ? null : ctaLabel(row.state)}
		<li
			data-testid="beitragsverlauf-row"
			data-year={row.year}
			data-state={row.state}
			data-hero={isHero ? 'true' : undefined}
			data-locked={row.isLocked ? 'true' : undefined}
			class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2.5 {isHero
				? 'border-l-2 border-l-primary bg-muted/40'
				: 'border-l-2 border-l-transparent'}"
		>
			<span class="w-12 shrink-0 text-sm font-semibold tabular-nums text-foreground">
				{row.year}
			</span>

			<BeitragCell
				state={row.state}
				isLocked={row.isLocked}
				year={row.year}
				betragCents={row.betragCents}
				paidCents={row.paidCents}
				gezahltAm={row.gezahltAm}
				exemptReason={row.exemptReason}
				daysOverdue={row.daysOverdue ?? null}
			/>

			<span class="ml-auto text-right text-sm tabular-nums">
				{#if OWING.has(row.state)}
					<span class="font-semibold text-open-ink">{eur(restCents(row))}</span>
					{#if row.state === 'partial'}
						<span class="block text-xs text-muted-foreground">
							von {eur(row.betragCents)}
						</span>
					{/if}
				{:else if row.state === 'paid'}
					<span class="text-muted-foreground">{eur(row.paidCents)}</span>
				{:else}
					<span class="text-ink-300">—</span>
				{/if}
			</span>

			<span class="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
				{fmtDate(row.gezahltAm)}
			</span>

			{#if row.notes}
				<span
					class="w-full truncate text-xs text-muted-foreground"
					data-testid="beitragsverlauf-notes"
				>
					{row.notes}
				</span>
			{/if}

			{#if label}
				<button
					type="button"
					onclick={() => onRecordPayment?.(row.year)}
					data-testid="beitragsverlauf-record"
					class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {isHero
						? 'bg-emerald-600 text-white hover:bg-emerald-700'
						: 'text-emerald-700 hover:bg-emerald-50'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{label}
				</button>
			{:else if row.isLocked}
				<span class="shrink-0 text-xs text-muted-foreground" data-testid="beitragsverlauf-locked">
					festgeschrieben
				</span>
			{/if}
		</li>
	{/each}
</ul>

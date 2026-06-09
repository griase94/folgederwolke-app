<!--
  TransactionCardMobile — single-row card variant of TransactionRow for use
  below the md breakpoint (PM-009). The desktop <table> squishes 7 columns
  unreadably at 390px; this card surfaces only the four properties a
  Kassenwart actually scans on mobile:

    [icon] Bezeichnung               -12,50 €
           bezahlt_von               (kind pill • status pill)
           Datum

  Each card is a tap-target navigating to the detail page.

  Per-tab scan signals (combined-review high): the card row is typed as a
  `BaseTxRow` plus the OPTIONAL per-tab display fields, so a single-kind tab list
  can surface its load-bearing signal on mobile — the Einnahmen aus-Rechnung
  (`rechnungBusinessId`) link and the Spenden Bescheinigung state
  (`bescheinigungNr` → "Nr. …" / "ohne Bescheinigung"). Fields absent on a given
  tab's row are simply `undefined` and their block doesn't render.
-->
<script lang="ts">
	import type { BaseTxRow } from '$lib/server/domain/transactions.js';
	import { Money } from '$lib/components/ui/money/index.js';
	import Lock from '@lucide/svelte/icons/lock';
	import Link from '@lucide/svelte/icons/link';
	import { statusPresentation } from '$lib/domain/transaction-status.js';

	/**
	 * The mobile card reads the shared base fields plus a tab's OPTIONAL display
	 * columns. Each per-tab `listXPage` row (Ausgaben/Einnahmen/Spenden) is a
	 * `BaseTxRow` subtype, so it is assignable here; missing fields are undefined.
	 */
	type CardRow = BaseTxRow & {
		status?: string | null;
		bezahltVonDisplay?: string | null;
		rechnungsdatum?: string | null;
		rechnungBusinessId?: string | null;
		bescheinigungNr?: string | null;
		spenderName?: string | null;
	};

	let {
		row,
		selected,
		ontoggle,
		detailHref,
		selectable = false,
		showKindPill = true,
	}: {
		row: CardRow;
		selected: boolean;
		ontoggle: (id: string) => void;
		/**
		 * The per-tab detail URL, e.g. "/app/ausgaben/<id>". Required — the scaffold
		 * always passes `${detailHrefBase}/${row.id}`. The old /app/transactions/
		 * fallback is removed: that route is retired (T5 cleanup).
		 */
		detailHref: string;
		/**
		 * Whether the bulk-select checkbox renders. Only Ausgaben has a bulk
		 * Erstattung workflow, so Einnahmen/Spenden pass `false` to avoid a no-op
		 * checkbox the scaffold would never read. Defaults to false (opt-in).
		 */
		selectable?: boolean;
		/**
		 * Whether the kind pill (Ausgabe/Einnahme/Spende) renders. On a single-kind
		 * tab list the pill is redundant (the whole list is one kind), so the
		 * scaffold passes `false`. Defaults to true for merged/unknown contexts.
		 */
		showKindPill?: boolean;
	} = $props();

	function fmtDate(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
		});
	}

	const kindLabel: Record<string, string> = {
		expense: 'Ausgabe',
		income: 'Einnahme',
		donation: 'Spende',
	};

	const kindColor: Record<string, string> = {
		expense: 'bg-red-50 text-red-700 ring-red-200',
		income: 'bg-green-50 text-green-700 ring-green-200',
		donation: 'bg-blue-50 text-blue-700 ring-blue-200',
	};

	const isFestgeschrieben = $derived(row.festgeschriebenAt !== null);

	// Money component expects positive cents = green, negative = red.
	// Expenses are stored positive in this data shape; flip sign to indicate
	// outflow so the colour and minus sign render correctly.
	const moneyCents = $derived(row.kind === 'expense' ? -row.betragCents : row.betragCents);
</script>

<article
	data-testid="transaction-card"
	class={[
		'group flex items-stretch gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm transition-shadow',
		selected ? 'bg-primary/5 ring-2 ring-primary/40' : '',
		isFestgeschrieben ? 'opacity-75' : '',
	].join(' ')}
>
	<!-- Bulk-select checkbox: tap-friendly column on the left. Only rendered when
	     the tab opts in (`selectable`) — Ausgaben has the bulk Erstattung flow;
	     Einnahmen/Spenden would otherwise show a no-op checkbox. -->
	{#if selectable}
		<!-- ≥44px tap target: the wrapping label provides the touch area (centered),
		     the visual checkbox stays 16px. The −ml/−my pulls the larger hit area
		     back so it doesn't add visible padding to the card row. -->
		<label
			class="-my-3 -ml-1 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center"
		>
			<input
				type="checkbox"
				checked={selected}
				onchange={() => ontoggle(row.id)}
				aria-label="Auswählen"
				class="h-4 w-4 rounded border-border accent-primary"
				disabled={isFestgeschrieben}
			/>
		</label>
	{/if}

	<!-- Main content: tap target is the link wrapping the text block. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a
		href={detailHref}
		class="flex min-w-0 flex-1 flex-col gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
	>
		<div class="flex items-start gap-2">
			<div class="min-w-0 flex-1">
				<!-- T5: title tooltip surfaces the full text when truncated. -->
				<p class="truncate font-medium text-foreground" title={row.bezeichnung}>{row.bezeichnung}</p>
				{#if row.bezahltVonDisplay}
					<p class="truncate text-xs text-muted-foreground">{row.bezahltVonDisplay}</p>
				{/if}
			</div>
			<Money valueInCents={moneyCents} forceSign="auto" class="shrink-0 text-base" />
		</div>

		<div class="flex flex-wrap items-center gap-1.5 text-xs">
			{#if showKindPill}
				<!-- Redundant on a single-kind tab list (the scaffold passes
				     showKindPill=false there); kept for merged/unknown contexts. -->
				<span
					class={[
						'inline-flex items-center rounded-full px-2 py-0.5 font-medium ring-1 ring-inset',
						kindColor[row.kind] ?? 'bg-muted text-muted-foreground ring-border',
					].join(' ')}
				>
					{kindLabel[row.kind] ?? row.kind}
				</span>
			{/if}

			{#if row.status}
				<!-- Label + tone from the SHARED transaction-status map (item 7) — keeps
				     the card identical to the desktop Ausgaben status column. -->
				<span
					class={[
						'inline-flex items-center rounded-full px-2 py-0.5 font-medium',
						statusPresentation(row.status).tone,
					].join(' ')}
				>
					{statusPresentation(row.status).label}
				</span>
			{/if}

			<!-- Einnahmen scan signal: the aus-Rechnung link the desktop 🔗 column
			     shows; otherwise invisible on mobile. -->
			{#if row.kind === 'income' && row.rechnungBusinessId}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700"
					data-testid="card-rechnung"
				>
					<Link class="size-3" aria-hidden="true" />
					aus Rechnung {row.rechnungBusinessId}
				</span>
			{/if}

			<!-- Spenden scan signal: the central Bescheinigung action state
			     (issued B-number vs still ausstehend) — the donation tab's primary
			     check-on-the-go. -->
			{#if row.kind === 'donation'}
				<span
					class={[
						'inline-flex items-center rounded-full px-2 py-0.5 font-medium',
						row.bescheinigungNr ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700',
					].join(' ')}
					data-testid="card-bescheinigung"
				>
					{row.bescheinigungNr ? `Bescheinigung ${row.bescheinigungNr}` : 'ohne Bescheinigung'}
				</span>
			{/if}

			{#if isFestgeschrieben}
				<span
					class="inline-flex items-center text-muted-foreground"
					title="Festgeschrieben"
					aria-label="Festgeschrieben"
					role="img"
				>
					<Lock class="size-3.5" aria-hidden="true" />
				</span>
			{/if}

			<span class="ml-auto text-muted-foreground">
				{fmtDate(row.rechnungsdatum ?? row.gebuchtAm)}
			</span>
		</div>
	</a>
</article>

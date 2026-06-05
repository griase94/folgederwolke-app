<!--
  TransactionCardMobile — single-row card variant of TransactionRow for use
  below the md breakpoint (PM-009). The desktop <table> squishes 7 columns
  unreadably at 390px; this card surfaces only the four properties a
  Kassenwart actually scans on mobile:

    [icon] Bezeichnung               -12,50 €
           bezahlt_von               (kind pill • status pill)
           Datum

  Each card is a tap-target navigating to the detail page. We rely on the
  same TransactionRow data shape — no new domain helpers required.

  TODO(per-tab mobile signals): this card is typed to the shared `TransactionRow`
  and the scaffold bridges the per-tab row with a contained `as unknown as`
  cast, so per-tab-only signals are LOST on mobile: the Einnahmen 🔗
  `rechnungBusinessId` aus-Rechnung link, and the Spenden `spenderName` /
  `bescheinigungNr` Bescheinigung state. Surfacing them needs the card to become
  generic over `BaseTxRow` (like the desktop columns) or `TransactionRow` to
  carry the union — a bigger retype deferred out of this shared-kit batch.
-->
<script lang="ts">
	import type { TransactionRow } from '$lib/server/domain/transactions.js';
	import { Money } from '$lib/components/ui/money/index.js';
	import Lock from '@lucide/svelte/icons/lock';

	let {
		row,
		selected,
		ontoggle,
		detailHref,
		selectable = false,
		showKindPill = true,
	}: {
		row: TransactionRow;
		selected: boolean;
		ontoggle: (id: string) => void;
		detailHref?: string;
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
	const resolvedDetailHref = $derived(detailHref ?? `/app/transactions/${row.id}?kind=${row.kind}`);

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

	const statusLabel: Record<string, string> = {
		zu_pruefen: 'Zu prüfen',
		in_pruefung: 'In Prüfung',
		geprueft: 'Genehmigt',
		abgelehnt: 'Abgelehnt',
		erstattet: 'Erstattet',
		importiert: 'Importiert',
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
		<label class="flex shrink-0 items-start pt-0.5">
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
		href={resolvedDetailHref}
		class="flex min-w-0 flex-1 flex-col gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
	>
		<div class="flex items-start gap-2">
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium text-foreground">{row.bezeichnung}</p>
				{#if row.bezahltVonDisplay}
					<p class="truncate text-xs text-muted-foreground">{row.bezahltVonDisplay}</p>
				{/if}
			</div>
			<Money
				valueInCents={moneyCents}
				forceSign={row.kind === 'expense' ? 'auto' : 'auto'}
				class="shrink-0 text-base"
			/>
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
				<span
					class={[
						'inline-flex items-center rounded-full px-2 py-0.5 font-medium',
						row.status === 'erstattet'
							? 'bg-green-50 text-green-700'
							: row.status === 'geprueft'
								? 'bg-amber-50 text-amber-700'
								: row.status === 'abgelehnt'
									? 'bg-red-50 text-red-700'
									: 'bg-muted text-muted-foreground',
					].join(' ')}
				>
					{statusLabel[row.status] ?? row.status}
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

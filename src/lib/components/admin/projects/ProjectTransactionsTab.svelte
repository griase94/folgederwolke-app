<!--
  ProjectTransactionsTab — "Transaktionen" tab content on the project detail
  page. Renders a flat table of up to 50 most-recent transactions (income +
  expenses) linked to the project, ordered by datum DESC NULLS LAST.

  Scope-guard reminder: this is one of only two tabs that ship in
  C1-PRJ-A Phase 1. The expanded transaction view + Rechnungen/Auslagen
  detail tabs are Night-2 C1-PRJ-B/C work.
-->
<script lang="ts">
	export type TxnRow = {
		id: string;
		kind: 'income' | 'expense' | 'donation';
		bezeichnung: string;
		betragCents: number;
		datum: string | null;
		status: string;
	};

	let { rows }: { rows: TxnRow[] } = $props();

	const fmt = (c: number) =>
		(c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	const kindLabel: Record<TxnRow['kind'], string> = {
		income: 'Einnahme',
		expense: 'Ausgabe',
		donation: 'Spende',
	};
</script>

<section
	class="overflow-hidden rounded-xl border border-border dark:border-border/60"
	data-testid="project-transactions-tab"
>
	<table class="w-full text-sm">
		<thead
			class="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground dark:bg-muted/20"
		>
			<tr>
				<th class="px-3 py-2 text-left">Datum</th>
				<th class="px-3 py-2 text-left">Bezeichnung</th>
				<th class="px-3 py-2 text-left">Art</th>
				<th class="px-3 py-2 text-right">Betrag</th>
				<th class="px-3 py-2 text-left">Status</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as r (r.id)}
				<tr class="border-t border-border dark:border-border/60">
					<td class="px-3 py-2 tabular-nums">{r.datum ?? '—'}</td>
					<td class="px-3 py-2">{r.bezeichnung}</td>
					<td class="px-3 py-2">{kindLabel[r.kind] ?? r.kind}</td>
					<td class="px-3 py-2 text-right tabular-nums">{fmt(r.betragCents)}</td>
					<td class="px-3 py-2">{r.status}</td>
				</tr>
			{:else}
				<tr>
					<td
						colspan="5"
						class="px-3 py-6 text-center text-muted-foreground"
					>
						Noch keine Buchungen.
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

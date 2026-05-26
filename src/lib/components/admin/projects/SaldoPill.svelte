<!--
  SaldoPill — colour-coded saldo display for a project.

  Green when saldo >= 0, red when negative, neutral when exactly zero. Includes
  dark: variants. Used in:
   - ProjectRow (list view)
   - ProjectDetailHero (detail view)
   - dashboard Top-Projekte widget (Night 2 follow-up)

  The data-saldo-sign attribute lets e2e tests assert the colour bucket
  deterministically (positive / negative / zero).
-->
<script lang="ts">
	let { saldoCents }: { saldoCents: number } = $props();

	const fmt = (c: number) =>
		(c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	const sign: 'positive' | 'negative' | 'zero' = $derived(
		saldoCents > 0 ? 'positive' : saldoCents < 0 ? 'negative' : 'zero',
	);

	const classes = $derived(
		sign === 'positive'
			? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
			: sign === 'negative'
				? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
				: 'bg-muted text-muted-foreground dark:bg-muted/40',
	);
</script>

<span
	class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums {classes}"
	data-testid="saldo-pill"
	data-saldo-sign={sign}
>
	{fmt(saldoCents)}
</span>

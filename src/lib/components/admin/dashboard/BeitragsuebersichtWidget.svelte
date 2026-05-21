<!--
	BeitragsuebersichtWidget — dashboard slot between WGB and activity feed.

	C4-DASH-lite (O-3 / M-1): the dashboard hid Mitgliedsbeiträge entirely.
	This widget shows the YTD picture in one glance and clicks through to
	`/app/mitglieder` for the per-member matrix.

	Shipped with `dark:` variants from the start (CLAUDE.md dark-mode
	discipline) so a later "add dark mode" pass doesn't have to touch this.
-->
<script lang="ts">
	interface Props {
		year: number;
		memberCount: number;
		paidCents: number;
		offenCents: number;
		paidMemberCount: number;
		openMemberCount: number;
	}

	let {
		year,
		memberCount,
		paidCents,
		offenCents,
		paidMemberCount,
		openMemberCount: _openMemberCount,
	}: Props = $props();

	const fmtEur = (c: number) =>
		(c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

	const totalCents = $derived(paidCents + offenCents);
	const paidPct = $derived(totalCents === 0 ? 0 : Math.round((paidCents / totalCents) * 100));
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
<a
	href="/app/mitglieder"
	class="block rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-border/60 dark:bg-card/40 dark:hover:bg-muted/30"
	data-testid="beitragsuebersicht-widget"
	data-year={year}
>
	<div class="flex items-start justify-between gap-2">
		<h2 class="text-sm font-medium text-muted-foreground">Mitgliedsbeiträge {year}</h2>
		<span class="text-xs text-muted-foreground" aria-hidden="true">→</span>
	</div>
	<p
		class="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums"
		data-testid="beitragsuebersicht-paid"
	>
		{fmtEur(paidCents)}
	</p>
	<p class="mt-1 text-xs text-muted-foreground tabular-nums">
		<span data-testid="beitragsuebersicht-paid-count">{paidMemberCount}</span> von {memberCount}
		bezahlt · <span data-testid="beitragsuebersicht-open">{fmtEur(offenCents)}</span> offen
	</p>
	<div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted dark:bg-muted/40">
		<div class="h-full bg-emerald-500 dark:bg-emerald-400" style="width: {paidPct}%"></div>
	</div>
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->

<script lang="ts" module>
	import type { BescheinigungStatus } from '$lib/server/eur/spenden-status.js';
	import { BESCHEINIGUNG_STATUS_LABEL } from '$lib/server/eur/spenden-status.js';

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
	}

	const STATUS_CHIP: Record<BescheinigungStatus, string> = {
		issued: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
		pending: 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400',
		declined: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400',
		na: 'bg-muted text-muted-foreground'
	};
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { EmptyState } from '$lib/components/ui/empty-state/index.js';
	import { formatMoney } from '$lib/components/ui/money/index.js';

	let { year, rows, totals, bescheinigungEnabled }: SpendenTabProps = $props();

	function formatDate(iso: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Spenden {year} – Jahresabschluss</title>
</svelte:head>

<div class="space-y-5">
	<!-- KPI strip -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
			<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Spenden</div>
			<div class="mt-1 text-xl font-bold tabular-nums text-foreground">{totals.count}</div>
		</div>
		<div class="rounded-xl border border-border bg-card p-4 shadow-sm">
			<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summe</div>
			<div class="mt-1 text-xl font-bold tabular-nums text-foreground">
				{formatMoney(totals.totalCents)}
			</div>
		</div>
		<div class="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/10">
			<div class="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
				Bescheinigungen ausgestellt
			</div>
			<div class="mt-1 text-xl font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
				{totals.issued}
			</div>
		</div>
		<div class="rounded-xl border border-amber-200 bg-amber-50/30 p-4 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/10">
			<div class="text-xs font-medium uppercase tracking-wide text-amber-800 dark:text-amber-400">
				Offene Bescheinigungen
			</div>
			<div class="mt-1 text-xl font-bold tabular-nums text-amber-900 dark:text-amber-300">
				{totals.pending}
			</div>
		</div>
	</div>

	{#if rows.length === 0}
		<EmptyState
			title={`Keine Spenden im Buchungsjahr ${year}`}
			description="Sobald Spenden eingegangen sind, erscheinen sie hier zur Bescheinigungs-Verwaltung."
		>
			{#snippet cta()}
				<Button href={`/app/transactions/spenden?year=${year}`}>
					Spende erfassen
				</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div
			data-testid="spenden-table"
			class="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
		>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border bg-muted/40">
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Datum</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Spender:in</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Kategorie</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Betrag</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Bescheinigung</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Aktion</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as r (r.id)}
							<tr
								class="border-b border-border/50 hover:bg-muted/20"
								data-testid="spende-row"
								data-status={r.status}
							>
								<td class="px-4 py-3 whitespace-nowrap tabular-nums text-foreground">
									{formatDate(r.zugewendetAm ?? r.gebuchtAm)}
								</td>
								<td class="px-4 py-3">
									<div class="font-medium text-foreground">{r.spenderDisplay}</div>
									<div class="text-xs text-muted-foreground">{r.businessId}</div>
								</td>
								<td class="px-4 py-3 text-muted-foreground">{r.kategorieNameSnapshot}</td>
								<td class="px-4 py-3 text-right tabular-nums font-medium text-foreground">
									{formatMoney(r.betragCents)}
								</td>
								<td class="px-4 py-3">
									<span
										data-testid={`bescheinigungs-status-${r.status}`}
										class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CHIP[r.status]}`}
									>
										{BESCHEINIGUNG_STATUS_LABEL[r.status]}
									</span>
									{#if r.bescheinigungNr}
										<div class="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
											{r.bescheinigungNr}
										</div>
									{/if}
								</td>
								<td class="px-4 py-3 text-right">
									{#if r.status === 'pending'}
										{#if bescheinigungEnabled}
											<Button
												href={`/app/transactions/${r.id}`}
												variant="outline"
												size="sm"
												data-testid="bescheinigung-create-cta"
											>
												Bescheinigung erstellen
											</Button>
										{:else}
											<span
												class="text-xs text-muted-foreground"
												title="Bescheinigungs-Generierung in den Einstellungen aktivieren"
											>
												deaktiviert
											</span>
										{/if}
									{:else if r.status === 'issued'}
										<Button
											href={`/app/transactions/${r.id}`}
											variant="ghost"
											size="sm"
										>
											Anzeigen
										</Button>
									{:else}
										<span class="text-xs text-muted-foreground">—</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

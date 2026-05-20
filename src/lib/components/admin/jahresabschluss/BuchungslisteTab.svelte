<script lang="ts" module>
	import type {
		BuchungslisteFilters,
		BuchungslisteRow
	} from '$lib/server/eur/buchungsliste.js';

	export interface BuchungslisteTabProps {
		year: number;
		filters: BuchungslisteFilters;
		rows: BuchungslisteRow[];
		allRowsCount: number;
	}

	const SPHERE_LABELS: Record<string, string> = {
		ideeller: 'Ideeller Bereich',
		vermoegen: 'Vermögensverwaltung',
		zweckbetrieb: 'Zweckbetrieb',
		wirtschaftlich: 'Wirtschaftlicher Geschäftsbetrieb'
	};

	const SPHERE_CHIP: Record<string, string> = {
		ideeller: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
		vermoegen: 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300',
		zweckbetrieb: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300',
		wirtschaftlich: 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
	};

	const KIND_LABEL: Record<string, string> = {
		income: 'Einnahme',
		expense: 'Ausgabe',
		donation: 'Spende'
	};
</script>

<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { EmptyState } from '$lib/components/ui/empty-state/index.js';
	import { formatMoney } from '$lib/components/ui/money/index.js';

	let { year, filters, rows, allRowsCount }: BuchungslisteTabProps = $props();

	function hrefWith(overrides: Record<string, string | undefined>): string {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local URL builder, not a Svelte reactive store
		const params = new URLSearchParams();
		if (filters.sphere !== 'all') params.set('sphere', filters.sphere);
		if (filters.kind !== 'all') params.set('kind', filters.kind);
		if (filters.kategorieId) params.set('kategorie', filters.kategorieId);
		if (filters.projectId) params.set('project', filters.projectId);
		if (filters.sort !== 'date-desc') params.set('sort', filters.sort);
		for (const [k, v] of Object.entries(overrides)) {
			if (v === undefined || v === '' || v === 'all' || v === 'date-desc') {
				params.delete(k);
			} else {
				params.set(k, v);
			}
		}
		const q = params.toString();
		return `/app/jahresabschluss/${year}/buchungsliste${q ? '?' + q : ''}`;
	}

	function formatDate(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString('de-DE', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
	}

	function detailHref(r: BuchungslisteRow): string {
		// Existing detail route handles all kinds via /app/transactions/[id]
		return `/app/transactions/${r.id}`;
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->


<svelte:head>
	<title>Buchungsliste {year} – Jahresabschluss</title>
</svelte:head>

<div class="space-y-5">
	<!-- Filter chips row -->
	<div
		data-testid="buchungsliste-filters"
		class="rounded-xl border border-border bg-card p-4 shadow-sm"
	>
		<div class="space-y-3">
			<!-- Sphere chips -->
			<div>
				<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sphäre</div>
				<div class="mt-1.5 flex flex-wrap gap-1.5">
					<a
						href={hrefWith({ sphere: 'all' })}
						data-active={filters.sphere === 'all'}
						class="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted data-[active=true]:border-[#9c2870] data-[active=true]:bg-[#9c2870]/10 data-[active=true]:text-[#9c2870]"
					>
						Alle
					</a>
					{#each ['ideeller', 'vermoegen', 'zweckbetrieb', 'wirtschaftlich'] as s (s)}
						<a
							href={hrefWith({ sphere: s })}
							data-active={filters.sphere === s}
							data-testid={`filter-sphere-${s}`}
							class="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted data-[active=true]:border-[#9c2870] data-[active=true]:bg-[#9c2870]/10 data-[active=true]:text-[#9c2870]"
						>
							{SPHERE_LABELS[s]}
						</a>
					{/each}
				</div>
			</div>

			<!-- Kind chips -->
			<div>
				<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Art</div>
				<div class="mt-1.5 flex flex-wrap gap-1.5">
					<a
						href={hrefWith({ kind: 'all' })}
						data-active={filters.kind === 'all'}
						class="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted data-[active=true]:border-[#9c2870] data-[active=true]:bg-[#9c2870]/10 data-[active=true]:text-[#9c2870]"
					>
						Alle
					</a>
					{#each ['income', 'expense', 'donation'] as k (k)}
						<a
							href={hrefWith({ kind: k })}
							data-active={filters.kind === k}
							data-testid={`filter-kind-${k}`}
							class="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted data-[active=true]:border-[#9c2870] data-[active=true]:bg-[#9c2870]/10 data-[active=true]:text-[#9c2870]"
						>
							{KIND_LABEL[k]}
						</a>
					{/each}
				</div>
			</div>

			<!-- Sort chips -->
			<div>
				<div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Sortierung
				</div>
				<div class="mt-1.5 flex flex-wrap gap-1.5">
					{#each [{ id: 'date-desc', label: 'Datum (neu)' }, { id: 'date-asc', label: 'Datum (alt)' }, { id: 'betrag-desc', label: 'Betrag (groß)' }, { id: 'betrag-asc', label: 'Betrag (klein)' }] as opt (opt.id)}
						<a
							href={hrefWith({ sort: opt.id })}
							data-active={filters.sort === opt.id}
							data-testid={`sort-${opt.id}`}
							class="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted data-[active=true]:border-[#9c2870] data-[active=true]:bg-[#9c2870]/10 data-[active=true]:text-[#9c2870]"
						>
							{opt.label}
						</a>
					{/each}
				</div>
			</div>
		</div>

		<div class="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
			<span data-testid="buchungsliste-count">
				{rows.length} von {allRowsCount} Buchungen
			</span>
			{#if rows.length !== allRowsCount}
				<a
					href={`/app/jahresabschluss/${year}/buchungsliste`}
					class="font-medium text-[#9c2870] hover:underline"
				>
					Filter zurücksetzen
				</a>
			{/if}
		</div>
	</div>

	<!-- Rows -->
	{#if rows.length === 0}
		<EmptyState
			title="Keine Buchungen passen zu den Filtern"
			description="Lockere die Filter oder wechsle zur Übersicht."
		>
			{#snippet cta()}
				<Button href={`/app/jahresabschluss/${year}/buchungsliste`} variant="outline">
					Filter zurücksetzen
				</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<div
			data-testid="buchungsliste-table"
			class="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
		>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-border bg-muted/40">
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Datum</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Buchung</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Sphäre</th>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Art</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Betrag</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as r (r.id)}
							<tr
								class="border-b border-border/50 hover:bg-muted/20"
								data-testid="buchungsliste-row"
								data-row-id={r.id}
							>
								<td class="px-4 py-3 whitespace-nowrap text-foreground tabular-nums">
									{formatDate(r.gebuchtAm)}
								</td>
								<td class="px-4 py-3">
									<a
										href={detailHref(r)}
										class="font-medium text-foreground hover:text-[#9c2870] hover:underline"
									>
										{r.bezeichnung}
									</a>
									<div class="text-xs text-muted-foreground">{r.businessId}</div>
								</td>
								<td class="px-4 py-3">
									<span
										class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SPHERE_CHIP[r.sphereSnapshot] ?? ''}`}
									>
										{SPHERE_LABELS[r.sphereSnapshot] ?? r.sphereSnapshot}
									</span>
								</td>
								<td class="px-4 py-3 text-muted-foreground">{KIND_LABEL[r.kind] ?? r.kind}</td>
								<td class="px-4 py-3 text-right tabular-nums font-medium text-foreground">
									{formatMoney(r.betragCents)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</div>

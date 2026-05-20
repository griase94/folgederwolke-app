<script lang="ts">
	const SPHERE_LABELS: Record<string, string> = {
		ideeller: 'Ideeller Bereich',
		vermoegen: 'Vermögensverwaltung',
		zweckbetrieb: 'Zweckbetrieb',
		wirtschaftlich: 'Wirtschaftlicher Geschäftsbetrieb'
	};

	const SPHERES = ['ideeller', 'vermoegen', 'zweckbetrieb', 'wirtschaftlich'] as const;

	interface SphereSummary {
		sphere: string;
		einnahmenCount: number;
		ausgabenCount: number;
		einnahmenCents: number;
		ausgabenCents: number;
		ueberschussCents: number;
	}

	interface EurData {
		year: number;
		totalEinnahmenCents: number;
		totalAusgabenCents: number;
		totalUeberschussCents: number;
		bySphere: Record<string, SphereSummary>;
	}

	interface Props {
		eur: EurData;
	}

	let { eur }: Props = $props();

	function formatEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', {
			style: 'currency',
			currency: 'EUR',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}
</script>

<div class="rounded-xl border border-border bg-card shadow-sm">
	<!-- Header -->
	<div class="rounded-t-xl border-b border-border bg-muted/30 px-6 py-4">
		<h2 class="text-lg font-semibold text-foreground">
			Einnahmen-Überschuss-Rechnung {eur.year}
		</h2>
		<p class="mt-0.5 text-sm text-muted-foreground">Aggregation pro steuerlicher Sphäre</p>
	</div>

	<!-- Table -->
	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-border bg-muted/40">
					<th class="px-6 py-3 text-left font-medium text-muted-foreground">Sphäre</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">Buchungen</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">Einnahmen</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">Ausgaben</th>
					<th class="px-6 py-3 text-right font-medium text-muted-foreground">Überschuss</th>
				</tr>
			</thead>
			<tbody>
				{#each SPHERES as sphere (sphere)}
					{@const data = eur.bySphere[sphere]}
					{#if data}
						<tr class="border-b border-border/50 hover:bg-muted/20">
							<td class="px-6 py-3 font-medium text-foreground">
								{SPHERE_LABELS[sphere]}
							</td>
							<td class="px-4 py-3 text-right text-muted-foreground">
								{data.einnahmenCount + data.ausgabenCount}
							</td>
							<td class="px-4 py-3 text-right tabular-nums text-foreground">
								{formatEur(data.einnahmenCents)}
							</td>
							<td class="px-4 py-3 text-right tabular-nums text-foreground">
								{formatEur(data.ausgabenCents)}
							</td>
							<td
								class="px-6 py-3 text-right tabular-nums font-medium"
								class:text-green-700={data.ueberschussCents >= 0}
								class:text-red-700={data.ueberschussCents < 0}
							>
								{formatEur(data.ueberschussCents)}
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
			<tfoot>
				<tr class="border-t-2 border-border bg-muted/40">
					<td class="px-6 py-4 font-bold text-foreground">Gesamt</td>
					<td class="px-4 py-4"></td>
					<td class="px-4 py-4 text-right tabular-nums font-bold text-foreground">
						{formatEur(eur.totalEinnahmenCents)}
					</td>
					<td class="px-4 py-4 text-right tabular-nums font-bold text-foreground">
						{formatEur(eur.totalAusgabenCents)}
					</td>
					<td
						class="px-6 py-4 text-right tabular-nums font-bold"
						class:text-green-700={eur.totalUeberschussCents >= 0}
						class:text-red-700={eur.totalUeberschussCents < 0}
					>
						{formatEur(eur.totalUeberschussCents)}
					</td>
				</tr>
			</tfoot>
		</table>
	</div>

	<!-- Legal note -->
	<div class="rounded-b-xl border-t border-border/50 bg-muted/20 px-6 py-3">
		<p class="text-xs text-muted-foreground">
			Ideeller Bereich, Vermögensverwaltung und Zweckbetrieb sind steuerfrei. Wirtschaftlicher
			Geschäftsbetrieb ist steuerfrei unterhalb der Freigrenze von 50.000 € (§ 64 Abs. 3 AO, ab 2025).
		</p>
	</div>
</div>

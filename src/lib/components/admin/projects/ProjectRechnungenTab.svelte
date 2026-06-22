<!-- src/lib/components/admin/projects/ProjectRechnungenTab.svelte -->
<script lang="ts">
	type Rechnung = {
		id: string;
		projectId: string; // P2-B7: emit on row for cross-project leak detection
		businessId: string;
		bezeichnung: string;
		customerName: string;
		nettoCents: number;
		/** null = not yet paid, otherwise iso-date string */
		bezahltAm: string | null;
		rechnungsdatum: string;
		faelligkeitsDatum: string | null;
	};

	let { rechnungen }: { rechnungen: Rechnung[] } = $props();

	function fmtEur(cents: number) {
		return (cents / 100).toLocaleString("de-DE", {
			style: "currency",
			currency: "EUR",
		});
	}
	function fmtDate(d: string | null) {
		if (!d) return "—";
		return new Date(d).toLocaleDateString("de-DE", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
		});
	}
	function statusLabel(bezahltAm: string | null): string {
		return bezahltAm ? "bezahlt" : "offen";
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
{#if rechnungen.length === 0}
	<div
		class="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-muted-foreground"
	>
		Noch keine Rechnungen in diesem Projekt.
	</div>
{:else}
	<ul class="flex flex-col gap-2">
		{#each rechnungen as r (r.id)}
			<li>
				<a
					href="/app/rechnungen/{r.id}"
					data-testid="project-rechnung-row"
					data-project-id={r.projectId}
					class="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent dark:hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<div class="min-w-0 flex-1 flex flex-col">
						<span class="truncate font-medium">{r.businessId} · {r.bezeichnung}</span>
						<span class="text-sm text-muted-foreground"
							>{r.customerName} · {fmtDate(r.rechnungsdatum)} · Fällig: {fmtDate(
								r.faelligkeitsDatum,
							)}</span
						>
					</div>
					<div class="flex items-center gap-3">
						<span class="tabular-nums font-semibold">{fmtEur(r.nettoCents)}</span>
						<span
							class={[
								"rounded-full px-2 py-0.5 text-xs font-medium",
								r.bezahltAm
									? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
									: "bg-muted text-muted-foreground",
							].join(" ")}
						>
							{statusLabel(r.bezahltAm)}
						</span>
					</div>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<!-- src/lib/components/admin/projects/ProjectAuslagenTab.svelte -->
<script lang="ts">
	type Auslage = {
		id: string;
		projectId: string; // P2-B7
		ausId: string;
		bezeichnung: string;
		bezahltVonDisplay: string;
		betragCents: number;
		status: "offen" | "approved" | "rejected";
		submittedAt: string;
	};

	let { auslagen }: { auslagen: Auslage[] } = $props();
	const grouped = $derived.by(() => {
		const g = {
			offen: [] as Auslage[],
			approved: [] as Auslage[],
			rejected: [] as Auslage[],
		};
		for (const a of auslagen) g[a.status].push(a);
		return g;
	});
	function fmtEur(c: number) {
		return (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
	}
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -->
{#if auslagen.length === 0}
	<div
		class="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center text-muted-foreground"
	>
		Noch keine Auslagen in diesem Projekt.
	</div>
{:else}
	{#each ["offen", "approved", "rejected"] as status (status)}
		{#if grouped[status as keyof typeof grouped].length > 0}
			<section class="mb-6">
				<h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
					{status === "offen" ? "Offen" : status === "approved" ? "Genehmigt" : "Abgelehnt"}
				</h3>
				<ul class="flex flex-col gap-2">
					{#each grouped[status as keyof typeof grouped] as a (a.id)}
						<li>
							<a
								href="/app/inbox/{a.ausId}"
								data-testid="project-auslage-row"
								data-status={a.status}
								data-project-id={a.projectId}
								class="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent dark:hover:bg-accent/40"
							>
								<div class="flex flex-col">
									<span class="font-medium">{a.ausId} · {a.bezeichnung}</span>
									<span class="text-sm text-muted-foreground">{a.bezahltVonDisplay}</span>
								</div>
								<span class="tabular-nums font-semibold">{fmtEur(a.betragCents)}</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/each}
{/if}

<script lang="ts">
	import KpiCard from '$lib/components/admin/KpiCard.svelte';
	import ChecklistItem from '$lib/components/admin/ChecklistItem.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// ── Placeholder KPI data (Phase 3 stubs; real queries in Phase 4/5) ─────
	const kpis = [
		{
			label: 'Offene Auslagen',
			value: '5',
			sublabel: 'warten auf Prüfung',
			href: '/app/inbox',
		},
		{
			label: 'Zu erstatten heute',
			value: '0 €',
			sublabel: '0 genehmigte Auslagen',
			href: '/app/transactions',
		},
		{
			label: 'Mitgliederbeitrag fällig',
			value: '2',
			sublabel: 'Erinnerungen ausstehend',
			href: '/app/mitglieder',
		},
		{
			label: 'Spenden YTD',
			value: '0 €',
			sublabel: 'laufendes Geschäftsjahr',
			href: '/app/transactions',
		},
	] as const;

	// ── Placeholder checklist (Phase 3 stubs) ────────────────────────────────
	function handleSepa() {
		// Phase 4/5: generate + copy SEPA XML; no-op for Phase 3
		alert('SEPA XML — wird in Phase 5 implementiert.');
	}

	const greeting = $derived(() => {
		const hour = new Date().getHours();
		if (hour < 12) return 'Guten Morgen';
		if (hour < 18) return 'Guten Tag';
		return 'Guten Abend';
	});

	const displayName = $derived(() => {
		const n = data.user.name;
		if (n) return n.split(' ')[0] ?? n;
		return data.user.email.split('@')[0] ?? data.user.email;
	});
</script>

<div class="mx-auto max-w-4xl px-4 py-8 lg:px-8">
	<!-- Greeting header -->
	<div class="mb-8">
		<h1 class="text-2xl font-bold tracking-tight text-foreground">
			{greeting()}, {displayName()} 👋
		</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Folge der Wolke e.V. · Kassenführung
		</p>
	</div>

	<!-- KPI cards row -->
	<section aria-labelledby="kpi-heading" class="mb-10">
		<h2 id="kpi-heading" class="sr-only">Kennzahlen</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each kpis as kpi (kpi.label)}
				<KpiCard label={kpi.label} value={kpi.value} sublabel={kpi.sublabel} href={kpi.href} />
			{/each}
		</div>
	</section>

	<!-- Prescriptive checklist -->
	<section aria-labelledby="checklist-heading">
		<div class="mb-4 flex items-baseline gap-2">
			<h2 id="checklist-heading" class="text-lg font-semibold text-foreground">
				Was möchtest du heute tun?
			</h2>
			<span class="text-sm text-muted-foreground">Deine offenen Aufgaben</span>
		</div>

		<div class="space-y-3">
			<!-- Audit inbox -->
			<ChecklistItem
				count={5}
				label="Auslagen warten auf Prüfung"
				cta="Audit Inbox öffnen →"
				href="/app/inbox"
			/>

			<!-- SEPA XML -->
			<ChecklistItem
				count={3}
				label="Auslagen genehmigt — SEPA XML kopieren"
				cta="SEPA XML kopieren"
				onclick={handleSepa}
			/>

			<!-- Beitrags-Erinnerungen -->
			<ChecklistItem
				count={2}
				label="Beitrags-Erinnerungen versenden"
				cta="Mitglieder öffnen →"
				href="/app/mitglieder"
			/>
		</div>

		<p class="mt-6 text-xs text-muted-foreground">
			Platzhalter-Daten · Echte Abfragen ab Phase 4
		</p>
	</section>
</div>

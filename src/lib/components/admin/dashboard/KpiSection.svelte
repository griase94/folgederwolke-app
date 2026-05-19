<script lang="ts">
	import KpiCard from '$lib/components/admin/KpiCard.svelte';

	interface Props {
		openAuslagenCount: number;
		approvedNotErstattetCount: number;
		approvedNotErstattetSumCents: number;
		openBeitragsMembers: number;
		spendenYtdCents: number;
		activeMemberCount: number;
	}

	let {
		openAuslagenCount,
		approvedNotErstattetCount,
		approvedNotErstattetSumCents,
		openBeitragsMembers,
		spendenYtdCents,
		activeMemberCount
	}: Props = $props();

	function formatEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	const kpis = $derived([
		{
			label: 'Offene Auslagen',
			value: String(openAuslagenCount),
			sublabel: 'warten auf Prüfung',
			href: '/app/inbox'
		},
		{
			label: 'Zu erstatten',
			value: approvedNotErstattetCount > 0 ? formatEur(approvedNotErstattetSumCents) : '–',
			sublabel:
				approvedNotErstattetCount > 0
					? `${approvedNotErstattetCount} genehmigte Auslagen`
					: 'nichts offen',
			href: '/app/transactions'
		},
		{
			label: 'Beitrag fällig',
			value: String(openBeitragsMembers),
			sublabel: 'Mitglieder laufendes Jahr',
			href: '/app/mitglieder'
		},
		{
			label: 'Spenden YTD',
			value: formatEur(spendenYtdCents),
			sublabel: `${activeMemberCount} aktive Mitglieder`,
			href: '/app/transactions'
		}
	]);
</script>

<section aria-labelledby="kpi-heading" class="mb-10">
	<h2 id="kpi-heading" class="sr-only">Kennzahlen</h2>
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each kpis as kpi (kpi.label)}
			<KpiCard label={kpi.label} value={kpi.value} sublabel={kpi.sublabel} href={kpi.href} />
		{/each}
	</div>
</section>

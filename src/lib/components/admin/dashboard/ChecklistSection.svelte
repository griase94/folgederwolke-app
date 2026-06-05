<script lang="ts">
	import ChecklistItem from '$lib/components/admin/ChecklistItem.svelte';

	interface Props {
		openAuslagenCount: number;
		approvedNotErstattetCount: number;
		approvedNotErstattetSumCents: number;
		openBeitragsMembers: number;
	}

	let {
		openAuslagenCount,
		approvedNotErstattetCount,
		approvedNotErstattetSumCents,
		openBeitragsMembers
	}: Props = $props();

	function formatEur(cents: number): string {
		return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
	}

	const sepaLabel = $derived(
		approvedNotErstattetCount > 0
			? `${approvedNotErstattetCount} genehmigte Auslagen zahlen (${formatEur(approvedNotErstattetSumCents)}) ▸ SEPA XML kopieren`
			: 'Genehmigte Auslagen zahlen ▸ SEPA XML kopieren'
	);

	const beitragsLabel = $derived(
		openBeitragsMembers > 0
			? `${openBeitragsMembers} Mitglieder haben Beitrag noch nicht bezahlt ▸ Erinnerung senden`
			: 'Mitgliedsbeiträge prüfen ▸ Mitglieder öffnen'
	);
</script>

<section aria-labelledby="checklist-heading">
	<div class="mb-4 flex items-baseline gap-2">
		<h2 id="checklist-heading" class="text-lg font-semibold text-foreground">
			Was möchtest du heute tun?
		</h2>
		<span class="text-sm text-muted-foreground">Deine offenen Aufgaben</span>
	</div>

	<div class="space-y-3">
		<!-- 1. Auslagen prüfen -->
		<ChecklistItem
			count={openAuslagenCount}
			label={openAuslagenCount > 0
				? `${openAuslagenCount} Auslage${openAuslagenCount !== 1 ? 'n' : ''} warten auf Prüfung`
				: 'Keine offenen Auslagen — Audit Inbox leer'}
			cta={openAuslagenCount > 0 ? 'Review starten →' : 'Inbox öffnen →'}
			href="/app/inbox"
			empty={openAuslagenCount === 0}
		/>

		<!-- 2. SEPA XML — approved-not-erstattet -->
		<ChecklistItem
			count={approvedNotErstattetCount}
			label={sepaLabel}
			cta={approvedNotErstattetCount > 0 ? 'SEPA XML kopieren →' : 'Transaktionen öffnen →'}
			href="/app/ausgaben"
			empty={approvedNotErstattetCount === 0}
		/>

		<!-- 3. Beitrags-Erinnerungen -->
		<ChecklistItem
			count={openBeitragsMembers}
			label={beitragsLabel}
			cta={openBeitragsMembers > 0 ? 'Mitglieder öffnen →' : 'Mitglieder öffnen →'}
			href="/app/mitglieder"
			empty={openBeitragsMembers === 0}
		/>
	</div>
</section>

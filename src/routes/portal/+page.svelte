<script lang="ts">
	import { Receipt, Plus } from '@lucide/svelte';
	import EmptyState from '$lib/components/ui/empty-state/empty-state.svelte';
	import MemberAuslageRow from '$lib/components/portal/MemberAuslageRow.svelte';
	import WelcomeCard from '$lib/components/portal/WelcomeCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import type { PageData, ActionData } from './$types.js';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// `data` merges the portal layout load (member) with this page load.
	const vorname = $derived(data.member.vorname);
	const auslagen = $derived(data.auslagen);
	const summen = $derived(data.summen);

	// The card disappears the moment it is resolved — the server stamp is the
	// truth, this flag only avoids a flash before the load reruns.
	const welcomeResolved = $derived(
		Boolean(form && ('welcomeSaved' in form || 'welcomeDismissed' in form))
	);
	const showWelcome = $derived(data.showWelcome && !welcomeResolved);

	const savedIban = $derived(
		form && 'maskedIban' in form ? (form.maskedIban as string | null) : null
	);
	const welcomeError = $derived(
		form && 'welcomeError' in form ? (form.welcomeError as string) : null
	);
</script>

<svelte:head>
	<title>Mein Portal · {data.member.vorname} {data.member.nachname}</title>
</svelte:head>

<section class="mb-6" data-testid="portal-greeting">
	<h1 class="text-2xl font-semibold tracking-[-0.02em] text-ink-900">
		Servus, {vorname} — schön, dass du da bist.
	</h1>
	<p class="mt-1.5 text-sm text-ink-500">
		Hier siehst du deine eingereichten Auslagen und wo sie gerade stehen.
	</p>
</section>

{#if savedIban}
	<p
		class="mb-6 rounded-2xl border border-hairline bg-type-einnahme-tint px-4 py-3 text-sm font-medium text-type-einnahme"
		role="status"
		data-testid="portal-iban-saved"
	>
		Merci! Erstattungen gehen ab jetzt an {savedIban}.
	</p>
{/if}

{#if showWelcome}
	<WelcomeCard class="mb-6" {vorname} maskedIban={data.member.maskedIban} error={welcomeError} />
{/if}

<section class="mb-6">
	<Button
		href="/portal/auslagen/neu"
		size="cta"
		class="w-full sm:w-auto"
		data-testid="portal-einreichen-cta"
	>
		<Plus aria-hidden="true" />
		Auslage einreichen
	</Button>
</section>

<section aria-labelledby="meine-auslagen-heading">
	<div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
		<h2 id="meine-auslagen-heading" class="text-base font-semibold text-ink-900">Meine Auslagen</h2>
		{#if summen.anzahl > 0}
			<span
				class="grid min-w-6 place-items-center rounded-full bg-secondary px-1.5 text-xs font-semibold tabular-nums text-ink-700"
				data-testid="portal-auslagen-count">{summen.anzahl}</span
			>
			<!-- Summenzeile: what is still coming, and what already arrived.
			     Amounts stay plum — an Auslage is an Ausgabe, whatever its state. -->
			<p class="ml-auto text-xs text-ink-500" data-testid="portal-summen">
				{#if summen.offenCents > 0}
					<span class="font-semibold tabular-nums text-type-ausgabe"
						>{formatMoney(summen.offenCents)}</span
					> offen
				{/if}
				{#if summen.offenCents > 0 && summen.erstattetCents > 0}
					<span aria-hidden="true" class="px-1">·</span>
				{/if}
				{#if summen.erstattetCents > 0}
					<span class="font-semibold tabular-nums text-type-ausgabe"
						>{formatMoney(summen.erstattetCents)}</span
					> erstattet
				{/if}
			</p>
		{/if}
	</div>

	{#if auslagen.length === 0}
		<EmptyState
			data-testid="portal-auslagen-empty"
			title="Leg los mit deiner ersten Auslage"
			description="Beleg fotografieren, Betrag eintragen, fertig — den Rest macht der Vorstand."
		>
			{#snippet icon()}
				<Receipt class="size-7" />
			{/snippet}
		</EmptyState>
	{:else}
		<div
			class="divide-hairline divide-y overflow-hidden rounded-2xl border border-hairline bg-card"
			data-testid="portal-auslagen-list"
			role="list"
		>
			{#each auslagen as row (row.businessId)}
				<MemberAuslageRow
					businessId={row.businessId}
					bezeichnung={row.bezeichnung}
					betragCents={row.betragCents}
					rechnungsdatum={row.rechnungsdatum}
					status={row.status}
					href="/portal/auslagen/{row.businessId}"
				/>
			{/each}
		</div>
	{/if}
</section>

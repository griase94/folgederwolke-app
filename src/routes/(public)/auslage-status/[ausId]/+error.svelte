<script lang="ts">
	// Status detail errors render a DESIGNED body while preserving the HTTP
	// status: 404 → the neutral AUS-search (a typo is not an error — quieter than
	// a reject); 429 → a calm callout; anything else → a plain notice. The bad
	// number comes from the route param so the search is prefilled.
	import { page } from '$app/state';
	import StatusSplitShell from '$lib/components/public/StatusSplitShell.svelte';
	import StatusMedallion from '$lib/components/ui/StatusMedallion.svelte';
	import AusIdSearch from '$lib/components/public/AusIdSearch.svelte';
	import Callout from '$lib/components/public/Callout.svelte';
	import Search from '@lucide/svelte/icons/search';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Clock from '@lucide/svelte/icons/clock';
	import Lock from '@lucide/svelte/icons/lock';

	const badId = $derived(page.params.ausId ?? '');
	const status = $derived(page.status);
</script>

<svelte:head><title>Auslage-Status — {page.data.vereinName}</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-3 py-6 lg:px-6 lg:py-10">
	{#if status === 404}
		<StatusSplitShell tone="s404" centerMain>
			{#snippet aside()}
				<div class="flex flex-1 flex-col">
					<StatusMedallion class="mb-4" tone="s404" size="lg">{#snippet icon()}<Search />{/snippet}</StatusMedallion>
					<span class="text-[11px] font-bold tracking-wide text-ink-500 uppercase">Nicht gefunden</span>
					<h1 class="mt-2 max-w-[342px] text-[25px] leading-tight font-extrabold tracking-tight text-ink-900">Diese Nummer kennen wir nicht</h1>
					<p class="mt-3 max-w-[332px] text-[13.5px] leading-relaxed text-ink-700">
						Kein Drama — Tippfehler passieren. Prüf die Nummer und such nochmal, dann zeigen wir dir sofort den Stand.
					</p>
					{#if badId}
						<span class="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--sev-critical)_20%,transparent)] bg-severity-critical-tint px-3 py-1.5 text-[12.5px] font-bold tabular-nums text-severity-critical-text [&_svg]:size-3.5">
							<CircleAlert aria-hidden="true" />{badId}
						</span>
					{/if}
					<div class="mt-auto flex items-center gap-2 pt-5 text-[12px] font-semibold text-type-einnahme [&_svg]:size-4">
						<Lock aria-hidden="true" />Wir zeigen nur Auslagen, deren Nummer stimmt.
					</div>
				</div>
			{/snippet}
			{#snippet main()}
				<AusIdSearch value={badId} contactEmail={page.data.kontaktEmail ?? null} />
			{/snippet}
		</StatusSplitShell>
	{:else if status === 429}
		<div class="mx-auto max-w-lg">
			<Callout tone="warn" title="Kurz durchatmen" subtitle="Da kamen gerade viele Anfragen auf einmal. Warte einen kleinen Moment und lade die Seite dann nochmal — dein Status ist gleich wieder da.">
				{#snippet icon()}<Clock />{/snippet}
			</Callout>
		</div>
	{:else}
		<div class="mx-auto max-w-lg">
			<Callout tone="crit" title="Da ist etwas schiefgelaufen." subtitle={page.error?.message ?? 'Bitte versuch es später noch einmal.'}>
				{#snippet icon()}<CircleAlert />{/snippet}
			</Callout>
		</div>
	{/if}
</main>

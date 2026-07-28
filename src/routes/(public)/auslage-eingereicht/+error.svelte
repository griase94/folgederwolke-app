<script lang="ts">
	// The confirmation 404s a missing/unknown ?id= (bug-fix: never a blind fake
	// success — brief AC #3). But a 404 must not be a dead-end: this renders a
	// friendly notice with the two real exits — reach a status by its AUS-Nr, or
	// start a new Auslage. 429 gets the calm callout.
	import { page } from '$app/state';
	import Callout from '$lib/components/public/Callout.svelte';
	import Search from '@lucide/svelte/icons/search';
	import Plus from '@lucide/svelte/icons/plus';
	import Clock from '@lucide/svelte/icons/clock';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';

	const status = $derived(page.status);
</script>

<svelte:head><title>Auslage eingereicht — {page.data.vereinName}</title></svelte:head>

<main class="mx-auto w-full max-w-lg px-4 py-12 lg:py-16">
	{#if status === 429}
		<Callout tone="warn" title="Kurz durchatmen" subtitle="Da kamen gerade viele Anfragen auf einmal. Warte einen kleinen Moment und lade die Seite dann nochmal.">
			{#snippet icon()}<Clock />{/snippet}
		</Callout>
	{:else}
		<div class="rounded-[20px] border border-border bg-card p-6 text-center shadow-[var(--shadow-card)]">
			<span class="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-secondary text-ink-500 [&_svg]:size-6" aria-hidden="true">
				<Search />
			</span>
			<h1 class="text-[22px] font-extrabold tracking-tight text-ink-900">Keine Einreichung mit dieser Nummer</h1>
			<p class="mt-2.5 text-[13.5px] leading-relaxed text-ink-500">
				Prüf deine AUS-Nummer aus der Eingangs-Mail — oder reich einfach eine neue Auslage ein.
			</p>
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<div class="mt-6 flex flex-col gap-2.5">
				<a
					href="/auslage-status"
					class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] [background-image:var(--gradient-brand)] px-5 text-sm font-semibold text-white shadow-[var(--glow-brand)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4"
				>
					<Search aria-hidden="true" />Status über die AUS-Nummer suchen
				</a>
				<a
					href="/auslage-einreichen"
					class="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-hairline bg-card px-5 text-sm font-semibold text-primary-text transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4"
				>
					<Plus aria-hidden="true" />Weitere Auslage einreichen
				</a>
			</div>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{#if status !== 404}
				<p class="mt-4 flex items-center justify-center gap-1.5 text-xs text-severity-critical-text [&_svg]:size-3.5">
					<CircleAlert aria-hidden="true" />{page.error?.message ?? 'Unbekannter Fehler'}
				</p>
			{/if}
		</div>
	{/if}
</main>

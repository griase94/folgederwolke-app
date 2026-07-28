<!--
	AusIdSearch — the AUS-Nr search (Aurora A-flow S1, plate `.id-search` + 404
	help). Rendered both on the /auslage-status index route and inside the 404
	state of the detail route. A GET form to /auslage-status: the index load
	normalises + redirects to /auslage-status/[ausId] (works without JS); a light
	client handler uppercases/trims for snappier UX. The 404 aside stays neutral
	(never sev-critical) — a typo is not an error.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import Search from '@lucide/svelte/icons/search';
	import Info from '@lucide/svelte/icons/info';
	import Mail from '@lucide/svelte/icons/mail';
	import Send from '@lucide/svelte/icons/send';

	export interface AusIdSearchProps {
		/** Prefill (e.g. the not-found number the user typed). */
		value?: string;
		/** Contact email for the "still nothing?" help row; omit to hide it. */
		contactEmail?: string | null;
		class?: string;
		'data-testid'?: string;
	}
</script>

<script lang="ts">
	let {
		value = '',
		contactEmail,
		class: className,
		'data-testid': testId = 'aus-id-search'
	}: AusIdSearchProps = $props();

	// One-time seed of the search box from the prefill (the not-found number).
	// svelte-ignore state_referenced_locally
	let query = $state(value);
</script>

<div class={cn('flex flex-col gap-4', className)} data-testid={testId} data-slot="aus-id-search">
	<div class="flex flex-col gap-1.5">
		<h2 class="text-[20px] font-extrabold tracking-tight text-ink-900">AUS-Nummer suchen</h2>
		<p class="text-[13px] leading-relaxed text-ink-500">
			Gib die Nummer aus deiner Eingangs-Mail ein — sie beginnt immer mit <b class="font-semibold text-ink-700">AUS</b>.
		</p>
	</div>

	<form
		method="GET"
		action="/auslage-status"
		role="search"
		class="flex flex-col gap-2 sm:flex-row"
		onsubmit={() => {
			query = query.trim().toUpperCase();
		}}
	>
		<span
			class="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring [&_svg]:size-4 [&_svg]:text-ink-500"
		>
			<Search aria-hidden="true" />
			<input
				name="ausId"
				type="text"
				autocomplete="off"
				bind:value={query}
				placeholder="AUS-2026-0071"
				aria-label="Auslage-Nummer suchen"
				data-testid="aus-id-search-input"
				class="min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] font-semibold tracking-[0.02em] tabular-nums text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300"
			/>
		</span>
		<button
			type="submit"
			class="inline-flex h-11 flex-none items-center justify-center rounded-[10px] [background-image:var(--gradient-brand)] px-5 text-sm font-semibold text-white shadow-[var(--glow-brand)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
		>
			Suchen
		</button>
	</form>

	<div class="flex flex-col gap-1 rounded-[10px] border border-hairline bg-secondary/40 px-3.5 py-3">
		<span class="flex items-center gap-2 text-[12.5px] font-semibold text-ink-700 [&_svg]:size-4 [&_svg]:text-ink-500">
			<Info aria-hidden="true" />So sieht deine Nummer aus:
			<span class="tabular-nums text-ink-900">AUS-<em class="not-italic text-ink-500">JJJJ</em>-<em class="not-italic text-ink-500">NNNN</em></span>
		</span>
		<span class="text-[12px] leading-snug text-ink-500">
			Immer mit <span class="font-semibold text-type-ausgabe">AUS</span> vorne, dann das Jahr und die laufende
			Nummer — z. B. <span class="font-semibold text-type-ausgabe tabular-nums">AUS-2026-0071</span>.
		</span>
	</div>

	<div class="flex flex-col gap-3 border-t border-hairline pt-4">
		<div class="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-ink-500 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:flex-none [&_svg]:text-ink-300">
			<Mail aria-hidden="true" />
			<div><b class="font-semibold text-ink-700">Nummer nicht zur Hand?</b> Sie steht in deiner Eingangs-Mail — Betreff „Auslage eingegangen".</div>
		</div>
		<div class="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-ink-500 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:flex-none [&_svg]:text-ink-300">
			<Send aria-hidden="true" />
			<div>
				<b class="font-semibold text-ink-700">Immer noch nix gefunden?</b>
				{#if contactEmail}
					Schreib uns kurz an
					<a href="mailto:{contactEmail}" class="font-semibold text-primary-text underline underline-offset-2">{contactEmail}</a> — wir schauen für dich nach.
				{:else}
					Antworte einfach auf die Mail — wir schauen für dich nach.
				{/if}
			</div>
		</div>
	</div>
</div>

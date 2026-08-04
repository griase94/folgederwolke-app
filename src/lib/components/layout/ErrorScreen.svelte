<script lang="ts" module>
	export interface ErrorScreenAction {
		href: string;
		label: string;
		/** The single primary lands first; everything else is an outline. */
		variant?: 'default' | 'outline';
	}
</script>

<script lang="ts">
	/**
	 * ErrorScreen — the ONE body for both generic `+error.svelte` boundaries
	 * (root and /app). Route-specific boundaries that show a designed recovery
	 * (DetailErrorCard, the AUS-status search) stay as they are; this is the
	 * fallback when there is nothing smarter to offer.
	 *
	 * Every action is an EXPLICIT navigation. `history.back()` used to sit here
	 * as the /app secondary and is a dead button in a standalone PWA: there is no
	 * browser chrome, and on a cold start (installed icon → error) the history
	 * stack is empty, so the click did nothing at all.
	 */
	import { Button } from '$lib/components/ui/button/index.js';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	let {
		status,
		title,
		description,
		actions,
		/** Root boundary paints its own full-viewport surface; inside AdminShell
		 *  the shell already owns background + height. */
		standalone = false,
	}: {
		status: number;
		title: string;
		description: string;
		actions: ErrorScreenAction[];
		standalone?: boolean;
	} = $props();

	const notFound = $derived(status === 404);
</script>

<div
	class={[
		'flex flex-col items-center justify-center px-4 py-16',
		// Embedded, the AdminShell already owns background + scroll pane, so the
		// screen is just a padded block; only the root boundary paints a surface.
		standalone ? 'min-h-svh bg-background' : '',
	].join(' ')}
	data-slot="error-screen"
	data-status={status}
>
	<div class="w-full max-w-md text-center">
		<!-- 404 is wayfinding, not a failure — it keeps the brand accent. A real
		     error uses the severity-critical token (DESIGN-GUIDELINES §4). -->
		<div
			class={[
				'mx-auto mb-6 flex size-20 items-center justify-center rounded-full',
				notFound
					? 'bg-primary/10 text-primary'
					: 'bg-severity-critical/10 text-severity-critical-text',
			].join(' ')}
			aria-hidden="true"
		>
			{#if notFound}
				<CircleHelp class="size-10" strokeWidth={1.5} />
			{:else}
				<TriangleAlert class="size-10" strokeWidth={1.5} />
			{/if}
		</div>

		<p
			class={[
				'text-6xl font-black',
				notFound ? 'text-primary' : 'text-severity-critical-text',
			].join(' ')}
			aria-hidden="true"
		>
			{status}
		</p>

		<h1 class="mt-3 text-2xl font-semibold tracking-[-0.02em] text-ink-900">{title}</h1>

		<p class="mt-3 text-sm text-muted-foreground">{description}</p>

		<div class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
			{#each actions as action (action.href)}
				<Button href={action.href} size="cta" variant={action.variant ?? 'default'}>
					{action.label}
				</Button>
			{/each}
		</div>
	</div>
</div>

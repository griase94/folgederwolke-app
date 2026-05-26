<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { LogIn, Receipt, ArrowRight } from '@lucide/svelte';
	import { loggedOutLaunchTarget, setPreferredAuslage } from '$lib/client/pwa-entry.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let statusId = $state('');

	onMount(() => {
		// Sticky entry: a returning external (submitted before, never signed in)
		// is fast-forwarded straight to the Auslage form. A device that has ever
		// authenticated always stays on this landing (with the Anmelden CTA), so
		// a logged-out admin is never re-trapped on the form. See pwa-entry.ts.
		const target = loggedOutLaunchTarget();
		if (target) {
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			goto(target, { replaceState: true });
		}
	});

	function handleStatusLookup(event: SubmitEvent) {
		event.preventDefault();
		const id = statusId.trim();
		if (!id) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`/auslage-status/${encodeURIComponent(id)}`);
	}
</script>

<svelte:head>
	<title>Folge der Wolke e.V.</title>
</svelte:head>

<main class="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6 py-12">
	<!-- Brand -->
	<div class="mb-10 flex flex-col items-center text-center">
		<div
			class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
			aria-hidden="true"
		>
			<svg
				class="h-9 w-9 text-primary"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6 19z" />
			</svg>
		</div>
		<h1 class="text-2xl font-bold tracking-tight text-foreground">Folge der Wolke e.V.</h1>
		<p class="mt-2 text-sm text-muted-foreground">Vereins-Verwaltung — Buchhaltung &amp; Mitglieder</p>
	</div>

	<!-- Primary choices -->
	<div class="flex flex-col gap-3">
		{#if data.publicFormEnabled}
			<Button
				href="/auslage-einreichen"
				size="lg"
				class="h-12 w-full justify-center text-base"
				onclick={() => setPreferredAuslage()}
			>
				<Receipt class="size-5" />
				Auslage einreichen
			</Button>
		{/if}
		<Button
			href="/sign-in"
			variant="outline"
			size="lg"
			class="h-12 w-full justify-center text-base"
		>
			<LogIn class="size-5" />
			Anmelden
		</Button>
	</div>

	<!-- Status lookup for a returning external -->
	{#if data.publicFormEnabled}
		<div class="mt-10 border-t pt-6">
			<p class="mb-2 text-sm font-medium text-foreground">Status einer früheren Einreichung</p>
			<form class="flex gap-2" onsubmit={handleStatusLookup}>
				<input
					bind:value={statusId}
					inputmode="text"
					autocomplete="off"
					placeholder="AUS-2026-001"
					aria-label="Einreichungs-ID"
					class="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
				/>
				<Button type="submit" variant="ghost" size="lg" class="h-10 shrink-0">
					Ansehen
					<ArrowRight class="size-4" />
				</Button>
			</form>
		</div>
	{/if}
</main>

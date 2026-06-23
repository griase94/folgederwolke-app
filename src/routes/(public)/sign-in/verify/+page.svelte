<script lang="ts">
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		data
	}: {
		data: { email: string; token: string; deviceMismatch: boolean };
	} = $props();

	let pending = $state(false);
</script>

<svelte:head>
	<title>Anmeldung bestätigen – {page.data.vereinName}</title>
</svelte:head>

<main class="flex min-h-dvh items-center justify-center px-4">
	<div class="w-full max-w-sm space-y-6">
		<div class="space-y-1">
			<h1 class="text-2xl font-bold tracking-tight">Anmeldung bestätigen</h1>
		</div>

		{#if data.deviceMismatch}
			<!-- Device-binding warning (soft hint — surfaced inline, doesn't block submit) -->
			<div
				class="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
				role="note"
			>
				<strong>Hinweis:</strong> Du öffnest diesen Link in einem anderen Browser oder
				Gerät als dem, mit dem du den Anmelde-Link angefordert hast. Wenn das nicht du bist,
				lass diese Seite einfach geschlossen.
			</div>
		{/if}

		<p class="text-muted-foreground text-sm">
			Du meldest dich an als <strong class="text-foreground">{data.email}</strong>.
		</p>

		<form
			method="POST"
			use:enhance={() => {
				pending = true;
				return async ({ update }) => {
					pending = false;
					await update();
				};
			}}
		>
			<input type="hidden" name="token" value={data.token} />
			<Button type="submit" class="w-full" disabled={pending}>
				{pending ? 'Anmelden…' : 'Weiter als ' + data.email}
			</Button>
		</form>

		<p class="text-muted-foreground text-center text-xs">
			Dieser Link ist 15 Minuten gültig und kann nur einmal verwendet werden.
		</p>
	</div>
</main>

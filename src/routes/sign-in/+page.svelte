<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { PageData } from './$types.js';

	// B-2 — `data.reason` is whitelist-validated on the server (load fn);
	// the page only renders banner copy for values it knows about, and
	// never echoes raw querystring into HTML.
	let {
		form,
		data
	}: {
		form: { ok?: boolean; message?: string; error?: string } | null;
		data: PageData;
	} = $props();

	const REASON_BANNERS = {
		'signed-out': {
			kind: 'info' as const,
			text: 'Du wurdest abgemeldet.'
		},
		'signed-out-everywhere': {
			kind: 'info' as const,
			text: 'Du wurdest auf allen Geräten abgemeldet.'
		},
		'public-form-coming-soon': {
			kind: 'info' as const,
			text: 'Das öffentliche Formular ist momentan nicht aktiv.'
		},
		'not-authorised': {
			kind: 'warn' as const,
			text: 'Dein Account hat keinen Zugriff auf diese Seite.'
		}
	} as const;

	const banner = $derived(data.reason ? REASON_BANNERS[data.reason] : null);

	let pending = $state(false);
</script>

<svelte:head>
	<title>Anmelden – Folge der Wolke</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center px-4">
	<div class="w-full max-w-sm space-y-6">
		<div class="space-y-1">
			<h1 class="text-2xl font-bold tracking-tight">Anmelden</h1>
			<p class="text-muted-foreground text-sm">
				Gib deine E-Mail-Adresse ein. Du erhältst einen Anmelde-Link.
			</p>
		</div>

		{#if banner}
			<div
				class:rounded-md={true}
				class:border={true}
				class:px-4={true}
				class:py-3={true}
				class:text-sm={true}
				class={banner.kind === 'warn'
					? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100'
					: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-100'}
				role={banner.kind === 'warn' ? 'alert' : 'status'}
				data-testid="sign-in-reason-banner"
				data-reason={data.reason}
			>
				{banner.text}
			</div>
		{/if}

		{#if form?.ok}
			<div
				class="bg-primary/10 text-primary rounded-md border px-4 py-3 text-sm font-medium"
				role="status"
			>
				{form.message}
			</div>
		{:else}
			<form
				method="POST"
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						pending = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-1.5">
					<Label for="email">E-Mail-Adresse</Label>
					<Input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						placeholder="du@beispiel.de"
						required
					/>
					{#if form?.error}
						<p class="text-destructive text-xs">{form.error}</p>
					{/if}
				</div>

				<Button type="submit" class="w-full" disabled={pending}>
					{pending ? 'Wird gesendet…' : 'Anmelde-Link anfordern'}
				</Button>
			</form>
		{/if}
	</div>
</main>

<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status === 404 ? 'Seite nicht gefunden' : 'Fehler'} – {page.data.vereinName}</title>
</svelte:head>

<div class="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-16">
	<div class="w-full max-w-md text-center">
		<!-- Rosa accent cloud icon -->
		<div
			class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10"
			aria-hidden="true"
		>
			{#if page.status === 404}
				<svg
					class="h-10 w-10 text-primary"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
					/>
				</svg>
			{:else}
				<svg
					class="h-10 w-10 text-primary"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
					/>
				</svg>
			{/if}
		</div>

		<!-- Status code -->
		<p class="text-6xl font-black text-primary" aria-hidden="true">{page.status}</p>

		<!-- Heading -->
		<h1 class="mt-3 text-2xl font-bold tracking-tight text-foreground">
			{#if page.status === 404}
				Seite nicht gefunden
			{:else}
				Ein Fehler ist aufgetreten
			{/if}
		</h1>

		<!-- Description -->
		<p class="mt-3 text-sm text-muted-foreground">
			{#if page.status === 404}
				Diese Seite existiert leider nicht. Vielleicht wurde der Link geändert oder die Seite ist
				nicht mehr verfügbar.
			{:else if page.error?.message}
				{page.error.message}
			{:else}
				Beim Laden der Seite ist ein unerwarteter Fehler aufgetreten. Bitte versuche es noch
				einmal.
			{/if}
		</p>

		<!--
			CTA — both are explicit navigations, NOT history.back(): in a standalone
			PWA there is no browser history/back button, so history.back() was a
			no-op dead-end. "/" is the role-aware root (landing when logged out,
			/app when signed in), and /sign-in is always reachable.
		-->
		<div class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href="/"
				class="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
				</svg>
				Zur Startseite
			</a>
			<a
				href="/sign-in"
				class="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			>
				Anmelden
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	</div>
</div>

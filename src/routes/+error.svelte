<script lang="ts">
	import { page } from '$app/state';
	import ErrorScreen from '$lib/components/layout/ErrorScreen.svelte';

	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? 'Seite nicht gefunden' : 'Ein Fehler ist aufgetreten');
	const description = $derived(
		notFound
			? 'Diese Seite existiert leider nicht. Vielleicht wurde der Link geändert oder die Seite ist nicht mehr verfügbar.'
			: (page.error?.message ??
					'Beim Laden der Seite ist ein unerwarteter Fehler aufgetreten. Bitte versuche es noch einmal.')
	);
</script>

<svelte:head>
	<title>{title} – {page.data.vereinName}</title>
</svelte:head>

<!--
	„/" is the role-aware root (landing when logged out, /app when signed in) and
	/sign-in is always reachable — both explicit, so the PWA is never a dead end.
-->
<ErrorScreen
	status={page.status}
	{title}
	{description}
	standalone
	actions={[
		{ href: '/', label: 'Zur Startseite' },
		{ href: '/sign-in', label: 'Anmelden', variant: 'outline' }
	]}
/>

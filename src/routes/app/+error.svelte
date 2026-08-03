<script lang="ts">
	import { page } from '$app/state';
	import ErrorScreen from '$lib/components/layout/ErrorScreen.svelte';

	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? 'Seite nicht gefunden' : 'Ein Fehler ist aufgetreten');
	const description = $derived(
		notFound
			? 'Diese Admin-Seite existiert nicht.'
			: (page.error?.message ?? 'Beim Laden ist ein unerwarteter Fehler aufgetreten.')
	);
</script>

<svelte:head>
	<title>{title} – Admin – {page.data.vereinName}</title>
</svelte:head>

<!--
	One explicit destination. The old second button called history.back(), which
	is a no-op in the installed PWA (no browser chrome, empty stack on cold start).
-->
<ErrorScreen
	status={page.status}
	{title}
	{description}
	actions={[{ href: '/app', label: 'Zurück zum Dashboard' }]}
/>

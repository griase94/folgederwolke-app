<script lang="ts">
	import type { Snippet } from 'svelte';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';
	import type { LayoutData } from './$types.js';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<svelte:head>
	<title>Admin – Folge der Wolke</title>
</svelte:head>

<AdminShell user={data.user}>
	{@render children()}
</AdminShell>

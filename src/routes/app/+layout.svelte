<script lang="ts">
	import type { Snippet } from 'svelte';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import type { LayoutData } from './$types.js';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<svelte:head>
	<title>Admin – Folge der Wolke</title>
</svelte:head>

<AdminShell user={data.user}>
	{@render children()}
</AdminShell>

<!-- Single Toaster for all /app pages (svelte-sonner, richColors) -->
<Toaster richColors />

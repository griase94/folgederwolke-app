<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import AdminShell from '$lib/components/admin/AdminShell.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { markAuthedBefore } from '$lib/client/pwa-entry.js';
	import type { LayoutData } from './$types.js';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// Reaching any /app page means this device has authenticated. Record it
	// permanently so the PWA never auto-opens the public form for this device
	// again (protects a logged-out admin from being re-trapped). See pwa-entry.ts.
	onMount(() => markAuthedBefore());
</script>

<svelte:head>
	<title>Admin – Folge der Wolke</title>
</svelte:head>

<AdminShell user={data.user}>
	{@render children()}
</AdminShell>

<!-- Single Toaster for all /app pages (svelte-sonner, richColors) -->
<Toaster richColors />

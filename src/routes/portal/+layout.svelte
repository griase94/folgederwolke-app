<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import MemberShell from '$lib/components/layout/MemberShell.svelte';
	import type { LayoutData } from './$types.js';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();
</script>

<MemberShell member={data.member} vereinName={page.data.vereinName}>
	{@render children()}
</MemberShell>

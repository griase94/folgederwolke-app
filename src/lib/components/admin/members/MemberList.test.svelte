<script lang="ts">
	import MemberList from './MemberList.svelte';
	import type { MemberView } from '$lib/domain/members.js';

	let { members, years }: { members: MemberView[]; years: number[] } = $props();
</script>

<MemberList {members} {years} onEdit={() => {}} onAdd={() => {}} />

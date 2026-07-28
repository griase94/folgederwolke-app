<script lang="ts">
	import MemberList from './MemberList.svelte';
	import type { MemberView } from '$lib/domain/members.js';
	import type { MatrixCell } from '$lib/domain/beitrag-cell.js';

	let {
		members,
		years,
		cells = new Map<string, MatrixCell>()
	}: {
		members: MemberView[];
		years: number[];
		cells?: ReadonlyMap<string, MatrixCell>;
	} = $props();
</script>

<MemberList {members} {years} {cells} onEdit={() => {}} onAdd={() => {}} />

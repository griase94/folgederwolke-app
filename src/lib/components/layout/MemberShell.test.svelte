<script lang="ts">
	import MemberShell from './MemberShell.svelte';

	let {
		member = { vorname: 'Maximiliane', nachname: 'Hollerbach-Wimmer' },
		vereinName = 'Verein X e.V.'
	}: { member?: { vorname: string; nachname: string }; vereinName?: string } = $props();
</script>

<MemberShell {member} {vereinName}>
	<p data-testid="member-shell-content">Inhalt</p>
</MemberShell>

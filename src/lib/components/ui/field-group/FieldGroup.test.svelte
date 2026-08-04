<script lang="ts">
	import FieldGroup from './FieldGroup.svelte';
	import { Input } from '../input/index.js';

	let {
		required = false,
		optional = false,
		hint = undefined,
		error = undefined
	}: { required?: boolean; optional?: boolean; hint?: string; error?: string } = $props();
</script>

<FieldGroup label="Bezeichnung" for="fg-test" {required} {optional} {hint} {error}>
	{#snippet children({ describedBy, invalid })}
		<Input
			id="fg-test"
			name="bezeichnung"
			{required}
			aria-describedby={describedBy}
			aria-invalid={invalid}
		/>
	{/snippet}
</FieldGroup>

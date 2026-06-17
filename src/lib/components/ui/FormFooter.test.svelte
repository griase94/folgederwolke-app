<script lang="ts">
	import FormFooter from './FormFooter.svelte';

	let {
		missing = [] as string[],
		nonFieldError = undefined as { severity: 'warn' | 'critical'; message: string } | undefined
	} = $props();
</script>

<form>
	<input data-testid="gap-field" data-missing={missing.length > 0 ? 'true' : undefined} />
	<FormFooter {missing} {nonFieldError} submitLabel="Speichern" />
</form>

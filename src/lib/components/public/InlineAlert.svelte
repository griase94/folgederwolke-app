<script lang="ts">
	// One inline alert for the public flow (Aurora spec §6): replaces the
	// ad-hoc ?reason= banner markup on /sign-in. Severity tokens only —
	// brand pink is contractually banned from warnings (spec §2).
	let {
		severity = 'info',
		text,
		linkHref,
		linkLabel,
		testid,
		reason
	}: {
		severity?: 'info' | 'warn';
		text: string;
		linkHref?: string;
		linkLabel?: string;
		testid?: string;
		reason?: string;
	} = $props();
</script>

<div
	class="rounded-[10px] border px-4 py-3 text-sm {severity === 'warn'
		? 'border-severity-warn/40 bg-severity-warn/10 text-severity-warn-text'
		: 'border-severity-info/40 bg-severity-info/10 text-ink-700'}"
	role={severity === 'warn' ? 'alert' : 'status'}
	data-testid={testid}
	data-reason={reason}
>
	<p>{text}</p>
	{#if linkHref && linkLabel}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a
			href={linkHref}
			class="mt-1 inline-block font-medium text-primary-text underline underline-offset-2 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			{linkLabel}
		</a>
	{/if}
</div>

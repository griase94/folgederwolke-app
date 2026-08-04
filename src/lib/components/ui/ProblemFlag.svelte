<!--
	ProblemFlag — a blocking gap, named and (usually) navigable
	(Aurora A-flow S3.1, kit `.flag.flag-crit` / `.flag-warn`).

	Two rules the Abnahme was explicit about (#6/#11):
	  1. A blocker is NEVER neutral grey. Grey reads as "inactive"; this is
	     "you cannot finish until you fix it".
	  2. `crit` for a hard block (no IBAN ⇒ no reimbursement, §7), `warn` for
	     something that needs attention but does not stop the flow.

	With an `href` it renders as a link and takes the admin to the place the gap
	can actually be closed — the Ausgabe for an extern payer, the Mitglied for a
	member. Naming a problem without offering the fix is what the Werkstatt did
	before, and it left the admin hunting.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

	export type ProblemTone = 'crit' | 'warn';

	export interface ProblemFlagProps {
		/** What is wrong, in the admin's words. */
		children?: import('svelte').Snippet;
		tone?: ProblemTone;
		/** Where the gap can be closed. Omit for a non-actionable statement. */
		href?: string | null;
		class?: string;
		'data-testid'?: string;
	}

	const toneClass: Record<ProblemTone, string> = {
		crit: 'border-severity-critical/30 bg-severity-critical-tint text-severity-critical-text',
		warn: 'border-severity-warn/30 bg-severity-warn-tint text-severity-warn-text'
	};
</script>

<script lang="ts">
	let {
		children,
		tone = 'crit',
		href = null,
		class: className,
		'data-testid': testId = 'problem-flag'
	}: ProblemFlagProps = $props();

	const base =
		'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold md:min-h-9';
</script>

{#if href}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- caller-supplied in-app route -->
	<a
		{href}
		data-testid={testId}
		data-tone={tone}
		class={cn(base, toneClass[tone], 'hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', className)}
	>
		<TriangleAlert class="size-3.5 shrink-0" aria-hidden="true" />
		{@render children?.()}
	</a>
{:else}
	<span
		data-testid={testId}
		data-tone={tone}
		class={cn(base, toneClass[tone], className)}
	>
		<TriangleAlert class="size-3.5 shrink-0" aria-hidden="true" />
		{@render children?.()}
	</span>
{/if}

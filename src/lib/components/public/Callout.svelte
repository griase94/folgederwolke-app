<!--
	Callout — the Aurora inline notice (Aurora A-flow S1, plate `.callout`).

	A tinted tile (icon) + body (title + optional subtitle + optional actions).
	Richer than `public/InlineAlert` (which stays the minimal sign-in banner):
	this one carries the tile, the two-line body and an actions row the Auslage
	flow needs for next-step banners, server-error/offline/draft bands and the
	login nudge. Tones are SEVERITY/BRAND tokens only — brand pink is banned from
	warnings, and `warn`/`crit` never borrow brand (ANDY-LENS §4).

	tones: brand · info · warn · crit · ok
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	export type CalloutTone = 'brand' | 'info' | 'warn' | 'crit' | 'ok';

	export interface CalloutProps {
		tone?: CalloutTone;
		/** Bold lead line. */
		title: string;
		/** Optional secondary line under the title. */
		subtitle?: string;
		/** Icon snippet for the tile. */
		icon?: Snippet;
		/** Optional trailing actions (buttons/links) row. */
		actions?: Snippet;
		/** ARIA role — 'status' (polite) by default, 'alert' for errors. */
		role?: 'status' | 'alert';
		class?: string;
		'data-testid'?: string;
	}

	const shell: Record<CalloutTone, string> = {
		brand:
			'border-[color-mix(in_srgb,var(--primary)_22%,var(--border))] bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))]',
		info: 'border-severity-info/40 bg-severity-info/10',
		warn: 'border-[color-mix(in_srgb,var(--sev-warn)_30%,transparent)] bg-severity-warn-tint',
		crit: 'border-[color-mix(in_srgb,var(--sev-critical)_28%,transparent)] bg-severity-critical-tint',
		ok: 'border-[color-mix(in_srgb,var(--type-einnahme)_28%,transparent)] bg-type-einnahme-tint'
	};

	const tile: Record<CalloutTone, string> = {
		brand: '[background-image:var(--gradient-brand)] text-primary-foreground shadow-[var(--glow-brand)]',
		info: 'bg-severity-info/15 text-severity-info',
		warn: 'bg-severity-warn/20 text-severity-warn-text',
		crit: 'bg-severity-critical/15 text-severity-critical-text',
		ok: 'bg-type-einnahme/15 text-type-einnahme'
	};
</script>

<script lang="ts">
	let {
		tone = 'info',
		title,
		subtitle,
		icon,
		actions,
		role,
		class: className,
		'data-testid': testId = 'callout'
	}: CalloutProps = $props();

	const resolvedRole = $derived(role ?? (tone === 'warn' || tone === 'crit' ? 'alert' : 'status'));
</script>

<div
	class={cn('flex items-start gap-3 rounded-[14px] border px-4 py-3.5', shell[tone], className)}
	role={resolvedRole}
	data-testid={testId}
	data-tone={tone}
	data-slot="callout"
>
	{#if icon}
		<span
			class={cn('grid size-9 flex-none place-items-center rounded-[11px] [&_svg]:size-5', tile[tone])}
			aria-hidden="true"
		>
			{@render icon()}
		</span>
	{/if}
	<div class="min-w-0 flex-1">
		<div class="text-[13px] font-bold text-ink-900">{title}</div>
		{#if subtitle}
			<div class="mt-0.5 text-[12.5px] leading-relaxed text-ink-700">{subtitle}</div>
		{/if}
		{#if actions}
			<div class="mt-2.5 flex flex-wrap gap-2">{@render actions()}</div>
		{/if}
	</div>
</div>

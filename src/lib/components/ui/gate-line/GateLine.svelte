<!--
	GateLine — the Beleg-oder-Verzicht gate (F1 shared primitive).

	A bordered gate (kit §.gate) with a 2-way segment ("Beleg hochladen" |
	"Verzicht begründen"), a body that swaps per choice, and a completion
	readout that reads AMBER while something is missing and flips GREEN when the
	gate is satisfied — a problem state is never neutral grey (ANDY-LENS §4,
	kit ext gate-line.css). Flow A/B wires the real upload / reason field into
	the `body` snippet and drives `status`.
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	export interface GateOption {
		value: string;
		label: string;
		/** Optional leading icon snippet (aria-hidden). */
		icon?: Snippet;
	}

	export interface GateStatus {
		/** true → satisfied (green "bereit …"); false → missing (amber "Fehlt …"). */
		ok: boolean;
		text: string;
	}

	export interface GateLineProps {
		label: string;
		required?: boolean;
		/** Selected segment value (bindable). */
		value: string;
		onChange?: (value: string) => void;
		/** Segment options (default: Beleg / Verzicht). */
		options?: GateOption[];
		/** Right-aligned hint in the head (e.g. "Pflicht"). */
		pending?: string;
		/** The amber→green completion readout. Omit to hide it. */
		status?: GateStatus;
		body?: Snippet<[string]>;
		class?: string;
		'data-testid'?: string;
	}

	const DEFAULT_OPTIONS: GateOption[] = [
		{ value: 'beleg', label: 'Beleg hochladen' },
		{ value: 'verzicht', label: 'Verzicht begründen' }
	];
</script>

<script lang="ts">
	let {
		label,
		required = false,
		value = $bindable(),
		onChange,
		options = DEFAULT_OPTIONS,
		pending,
		status,
		body,
		class: className,
		'data-testid': testId = 'gate-line'
	}: GateLineProps = $props();

	function choose(v: string) {
		if (v === value) return;
		value = v;
		onChange?.(v);
	}
</script>

<div
	class={cn(
		'overflow-hidden rounded-[14px] border border-border',
		'bg-[linear-gradient(180deg,var(--card),color-mix(in_srgb,var(--secondary)_40%,transparent))]',
		className
	)}
	data-testid={testId}
	data-slot="gate-line"
>
	<!-- head: label (+ required) and optional pending hint -->
	<div class="flex items-center gap-2 px-[15px] pt-3.5 pb-1.5">
		<span class="flex items-center gap-1.5 text-[13px] font-semibold text-ink-700">
			{label}
			{#if required}<span class="text-primary-text" aria-hidden="true">*</span>{/if}
		</span>
		{#if pending}<span class="ml-auto text-[11px] text-ink-500">{pending}</span>{/if}
	</div>

	<!-- segmented pill track -->
	<div
		role="radiogroup"
		aria-label={label}
		class="mx-[15px] mt-1.5 flex gap-1 rounded-[9px] border border-hairline bg-secondary p-1"
	>
		{#each options as opt (opt.value)}
			{@const on = opt.value === value}
			<button
				type="button"
				role="radio"
				aria-checked={on}
				data-value={opt.value}
				data-state={on ? 'on' : 'off'}
				onclick={() => choose(opt.value)}
				class={cn(
					'flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[6px] border border-transparent px-2 py-2.5 text-[13px] font-semibold transition-colors',
					'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
					on
						? 'bg-card text-[color:var(--control)] shadow-sm ring-1 ring-[color-mix(in_srgb,var(--control)_20%,transparent)]'
						: 'bg-transparent text-ink-500 hover:text-ink-900'
				)}
			>
				{#if opt.icon}{@render opt.icon()}{/if}
				{opt.label}
			</button>
		{/each}
	</div>

	<!-- body: caller renders the branch for the current value -->
	<div class="px-[15px] pt-3.5 pb-[15px]">
		{@render body?.(value)}

		{#if status}
			<div
				class={cn(
					'mt-3 flex items-center gap-1.5 rounded-[9px] border px-3 py-2.5 text-xs font-semibold leading-snug',
					status.ok
						? 'border-[color-mix(in_srgb,var(--type-einnahme)_25%,transparent)] bg-type-einnahme-tint text-type-einnahme'
						: 'border-[color-mix(in_srgb,var(--sev-warn)_30%,transparent)] bg-severity-warn-tint text-severity-warn-text'
				)}
				data-slot="gate-readout"
				data-ok={status.ok}
				role="status"
			>
				{status.text}
			</div>
		{/if}
	</div>
</div>

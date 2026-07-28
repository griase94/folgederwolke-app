<!--
	StatusMedallion — the state-tinted hero ring (Aurora A-flow S1 shared).

	A circular badge that carries the STATUS TONE for the Auslage confirmation
	and status screens (the `.success-ring` / `.status-medallion` of the plates).
	The tone lives in the ring + icon; the amount it sits next to stays PLUM in
	every state (ANDY-LENS §4 — the medallion carries the "zurück" feeling, never
	the number). Icon is passed as a snippet so the caller picks the Lucide glyph.

	tones:
	  pruef  → brand-neutral (eingegangen / in Prüfung) — NEVER amber
	  frei   → brand-neutral (freigegeben, waiting for transfer)
	  done   → einnahme-green success ring (erstattet)
	  reject → sev-critical ring (abgelehnt)
	  s404   → neutral-grey, deliberately quieter than reject (not found)
-->
<script lang="ts" module>
	import { cn } from '$lib/utils.js';
	import type { Snippet } from 'svelte';

	export type MedallionTone = 'pruef' | 'frei' | 'done' | 'reject' | 's404';
	export type MedallionSize = 'md' | 'lg';

	export interface StatusMedallionProps {
		tone: MedallionTone;
		size?: MedallionSize;
		/** Icon snippet (a Lucide glyph); rendered in the tone colour. */
		icon: Snippet;
		class?: string;
		'data-testid'?: string;
	}

	// Ring background + icon colour per tone. Brand tones share one look so
	// eingegangen/in-Prüfung/freigegeben read as "in the pipeline, calm".
	const toneRing: Record<MedallionTone, string> = {
		pruef:
			'[background-image:var(--gradient-brand-soft)] text-primary-text ring-[color-mix(in_srgb,var(--primary)_22%,transparent)]',
		frei: '[background-image:var(--gradient-brand-soft)] text-primary-text ring-[color-mix(in_srgb,var(--primary)_22%,transparent)]',
		done: 'bg-type-einnahme-tint text-type-einnahme ring-[color-mix(in_srgb,var(--type-einnahme)_26%,transparent)]',
		reject:
			'bg-severity-critical-tint text-severity-critical-text ring-[color-mix(in_srgb,var(--sev-critical)_26%,transparent)]',
		s404: 'bg-secondary text-ink-500 ring-hairline'
	};

	const sizeClass: Record<MedallionSize, string> = {
		md: 'size-16 [&_svg]:size-7',
		lg: 'size-[92px] [&_svg]:size-10'
	};
</script>

<script lang="ts">
	let {
		tone,
		size = 'lg',
		icon,
		class: className,
		'data-testid': testId = 'status-medallion'
	}: StatusMedallionProps = $props();
</script>

<div
	class={cn(
		'grid shrink-0 place-items-center rounded-full ring-4 ring-inset',
		sizeClass[size],
		toneRing[tone],
		className
	)}
	data-testid={testId}
	data-tone={tone}
	data-slot="status-medallion"
	aria-hidden="true"
>
	{@render icon()}
</div>

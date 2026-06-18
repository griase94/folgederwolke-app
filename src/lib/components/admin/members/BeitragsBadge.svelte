<script lang="ts">
	/**
	 * BeitragsBadge — visual cell indicator for all 8 CellStates.
	 *
	 * Task 2.1: 7 visible states, lucide-svelte icons (NO emoji), 3 active
	 * bg-colors (emerald-50/bg-card/slate-50). Overdue uses left-border +
	 * TriangleAlert + "+Xd" suffix. Dark-mode from day one. WCAG 1.4.1:
	 * glyph is the primary signal, color is the reinforcer.
	 *
	 * Spec §7.2 + §16 V3/V4/V5.
	 */
	import Check from '@lucide/svelte/icons/check';
	import Circle from '@lucide/svelte/icons/circle';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Ban from '@lucide/svelte/icons/ban';
	import Lock from '@lucide/svelte/icons/lock';
	import Minus from '@lucide/svelte/icons/minus';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Info from '@lucide/svelte/icons/info';
	import type { CellState } from '$lib/domain/beitrag-cell.js';

	let {
		state,
		isLocked = false,
		betragCents = 0,
		paidCents = 0,
		gezahltAm = null,
		exemptReason = null,
		daysOverdue = null,
		year = 0,
		compact = false
	}: {
		state: CellState;
		/** When true, renders a lock corner decoration on top of the underlying state. */
		isLocked?: boolean;
		betragCents?: number;
		paidCents?: number;
		gezahltAm?: string | null;
		exemptReason?: string | null;
		daysOverdue?: number | null;
		year?: number;
		compact?: boolean;
	} = $props();

	/** Spec §7.2 aria-label templates. */
	function ariaLabel(): string {
		const eur = (cents: number) =>
			(cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
		switch (state) {
			case 'paid':
				return `Bezahlt am ${gezahltAm ?? '—'} · ${eur(paidCents)}`;
			case 'partial':
				return `Teilweise bezahlt — ${eur(paidCents)} von ${eur(betragCents)}`;
			case 'open':
				return `Offen — ${eur(betragCents)} fällig`;
			case 'overdue':
				return `Überfällig — ${eur(betragCents)} seit ${daysOverdue ?? 0} Tagen offen`;
			case 'exempt':
				return `Befreit — ${exemptReason ?? ''}`;
			case 'permanently_exempt':
				return `Dauerhaft befreit (Ehrenmitglied) — ${exemptReason ?? ''}`;
			case 'not_applicable_pre_join':
				return `Mitglied war in ${year} noch nicht im Verein`;
			case 'not_applicable_post_austritt':
				return 'Mitglied ausgetreten';
			case 'locked_year':
				return `Jahr ${year} festgeschrieben — keine Änderungen möglich`;
			default:
				return '';
		}
	}

	/** Short date "26.05." for compact paid display. */
	function shortDate(iso: string | null): string {
		if (!iso) return '';
		const [, mm, dd] = iso.split('-');
		return `${dd}.${mm}.`;
	}
</script>

<!--
  State-specific rendering. Each state has:
  - Container classes (bg, border)
  - Primary glyph (lucide-svelte, 14px)
  - Optional hover affordance (Pencil = write, Info = read-only)

  Spec §7.2 color table:
  - paid:              bg-emerald-50 / border-emerald-200
  - open/overdue:      bg-card / border-border (overdue adds left-bar)
  - exempt/perm_ex:    bg-slate-50 / border-slate-200
  - not_applicable:    bg-muted/30
  - locked_year:       opacity-60 cursor-not-allowed
-->

{#if state === 'paid'}
	<span
		class="group relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 transition-colors dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300"
		aria-label={ariaLabel()}
		data-state={state}
		title={ariaLabel()}
	>
		<Check size={14} class="shrink-0 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
		{#if !compact && gezahltAm}
			<span class="tabular-nums">{shortDate(gezahltAm)}</span>
		{/if}
		{#if isLocked}
			<Lock size={12} class="absolute right-0.5 top-0.5 text-muted-foreground" aria-hidden="true" />
		{:else}
			<!-- hover affordance: Info (read-only) -->
			<Info
				size={12}
				class="absolute right-0.5 top-0.5 opacity-0 transition-opacity group-hover:opacity-60"
				aria-hidden="true"
			/>
		{/if}
	</span>
{:else if state === 'partial'}
	<span
		class="group relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 transition-colors dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300"
		aria-label={ariaLabel()}
		data-state={state}
		title={ariaLabel()}
	>
		<Circle size={14} class="shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
		{#if !compact && betragCents > 0}
			<span class="tabular-nums text-[10px]"
				>{Math.round((paidCents / betragCents) * 100)}%</span
			>
		{/if}
		{#if isLocked}
			<Lock size={12} class="absolute right-0.5 top-0.5 text-muted-foreground" aria-hidden="true" />
		{:else}
			<!-- hover affordance: Pencil (write) -->
			<Pencil
				size={12}
				class="absolute right-0.5 top-0.5 opacity-0 transition-opacity group-hover:opacity-60"
				aria-hidden="true"
			/>
		{/if}
	</span>
{:else if state === 'open'}
	<span
		class="group relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground transition-colors dark:bg-card/80"
		aria-label={ariaLabel()}
		data-state={state}
		title={ariaLabel()}
	>
		<Circle size={14} class="shrink-0 text-muted-foreground" aria-hidden="true" />
		{#if isLocked}
			<Lock size={12} class="absolute right-0.5 top-0.5 text-muted-foreground" aria-hidden="true" />
		{:else}
			<!-- hover affordance: Pencil (write) -->
			<Pencil
				size={12}
				class="absolute right-0.5 top-0.5 opacity-0 transition-opacity group-hover:opacity-60"
				aria-hidden="true"
			/>
		{/if}
	</span>
{:else if state === 'overdue'}
	<span
		class="group relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md border border-y border-r border-border border-l-4 border-l-amber-600 bg-card px-2 py-1 text-xs font-medium text-amber-700 transition-colors dark:bg-card/80 dark:text-amber-400"
		aria-label={ariaLabel()}
		data-state={state}
		title={ariaLabel()}
	>
		<TriangleAlert size={14} class="shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
		{#if daysOverdue !== null}
			<span class="tabular-nums text-[10px]">+{daysOverdue}d</span>
		{/if}
		{#if isLocked}
			<Lock size={12} class="absolute right-0.5 top-0.5 text-muted-foreground" aria-hidden="true" />
		{:else}
			<!-- hover affordance: Pencil (write) -->
			<Pencil
				size={12}
				class="absolute right-0.5 top-0.5 opacity-0 transition-opacity group-hover:opacity-60"
				aria-hidden="true"
			/>
		{/if}
	</span>
{:else if state === 'exempt'}
	<span
		class="group relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 transition-colors dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400"
		aria-label={ariaLabel()}
		data-state={state}
		title={ariaLabel()}
		style="background-image: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(148,163,184,0.15) 4px, rgba(148,163,184,0.15) 5px);"
	>
		<Ban size={14} class="shrink-0 text-slate-600 dark:text-slate-400" aria-hidden="true" />
		<!-- hover affordance: Info (read-only) -->
		<Info
			size={12}
			class="absolute right-0.5 top-0.5 opacity-0 transition-opacity group-hover:opacity-60"
			aria-hidden="true"
		/>
	</span>
{:else if state === 'permanently_exempt'}
	<span
		class="group relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 transition-colors dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400"
		aria-label={ariaLabel()}
		data-state={state}
		title={ariaLabel()}
		style="background-image: repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(148,163,184,0.15) 4px, rgba(148,163,184,0.15) 5px);"
	>
		<Ban size={14} class="shrink-0 text-slate-600 dark:text-slate-400" aria-hidden="true" />
		<!-- Solid lock icon in opposite corner — spec §7.2 F11 -->
		<Lock
			size={12}
			class="absolute right-0.5 top-0.5 text-slate-500 dark:text-slate-500"
			aria-hidden="true"
		/>
	</span>
{:else if state === 'not_applicable_pre_join' || state === 'not_applicable_post_austritt'}
	<span
		class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md border border-border/30 bg-muted/30 px-2 py-1 text-xs dark:border-border/20 dark:bg-muted/20"
		aria-label={ariaLabel()}
		data-state={state}
		title={ariaLabel()}
	>
		<Minus
			size={14}
			class={state === 'not_applicable_post_austritt'
				? 'text-muted-foreground/30 dark:text-muted-foreground/20'
				: 'text-muted-foreground/20 dark:text-muted-foreground/10'}
			aria-hidden="true"
		/>
	</span>
{:else if state === 'locked_year'}
	<span
		class="group relative inline-flex min-h-[44px] min-w-[44px] cursor-not-allowed items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground opacity-60 transition-colors"
		aria-label={ariaLabel()}
		data-state={state}
		title={ariaLabel()}
	>
		<!-- Underlying state glyph (Minus for unknown, lock overlay corner) -->
		<Minus size={14} class="shrink-0 text-muted-foreground" aria-hidden="true" />
		<Lock
			size={12}
			class="absolute right-0.5 top-0.5 text-muted-foreground"
			aria-hidden="true"
		/>
	</span>
{/if}

<script lang="ts" module>
	export type DetailKind = "expense" | "income" | "donation";
	export type ChipTone = "neutral" | "ok" | "warn";
	export interface DetailStatusChip {
		label: string;
		tone: ChipTone;
		/** Which glyph precedes the label. */
		icon?: "refresh" | "check" | "lock" | "alert";
	}
</script>

<script lang="ts">
	/**
	 * DetailHead — the money-first transaction head (detail-views-v4 `.detail-head`).
	 *
	 * A 3px brand-gradient hairline, a type-tinted 48px icon tile, the Kennung as an
	 * id-chip + type label kicker, a 21px title, and a right-aligned type-coloured
	 * 36px Betrag. Below (read mode only) a hairline action row: the settled status
	 * chip (NEUTRAL for Erstattet/Bescheinigt/Festgeschrieben — green is only the
	 * fresh-confirmed moment, ANDY-LENS §4) + a meta line + the per-kind actions.
	 *
	 * `compact` (edit mode) drops the action row and inlines the status chip into
	 * the kicker, so the head reads as a quiet title bar above the form.
	 */
	import type { Snippet } from "svelte";
	import ArrowDownRight from "@lucide/svelte/icons/arrow-down-right";
	import ArrowUpRight from "@lucide/svelte/icons/arrow-up-right";
	import HandCoins from "@lucide/svelte/icons/hand-coins";
	import RefreshCw from "@lucide/svelte/icons/refresh-cw";
	import Check from "@lucide/svelte/icons/check";
	import Lock from "@lucide/svelte/icons/lock";
	import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
	import { formatCentsAsEuro } from "$lib/domain/money.js";

	interface Props {
		kind: DetailKind;
		businessId: string;
		title: string;
		betragCents: number;
		statusChip?: DetailStatusChip;
		/** Meta line after the chip (e.g. „erstattet am 20.06.2026 an Felix Bauer"). */
		meta?: string;
		/** Edit-mode head: no action row; the chip moves inline into the kicker. */
		compact?: boolean;
		/** Right-side action buttons (read mode only). */
		actions?: Snippet;
	}

	let {
		kind,
		businessId,
		title,
		betragCents,
		statusChip,
		meta,
		compact = false,
		actions,
	}: Props = $props();

	const PRESENTATION: Record<
		DetailKind,
		{ typeVar: string; tintVar: string; sign: string; label: string }
	> = {
		// U+2212 MINUS for the outflow sign (FB-A money doctrine), typed „+" otherwise.
		expense: {
			typeVar: "--type-ausgabe",
			tintVar: "--type-ausgabe-tint",
			sign: "−",
			label: "Ausgabe",
		},
		income: {
			typeVar: "--type-einnahme",
			tintVar: "--type-einnahme-tint",
			sign: "+",
			label: "Einnahme",
		},
		donation: {
			typeVar: "--type-spende",
			tintVar: "--type-spende-tint",
			sign: "+",
			label: "Spende",
		},
	};

	const p = $derived(PRESENTATION[kind]);
	// Absolute Betrag; DetailHead owns the typed sign so the amount reads clean.
	// Non-breaking space before € so the amount never wraps between value + unit.
	const amount = $derived(
		formatCentsAsEuro(BigInt(Math.abs(betragCents))).replace(" €", " €"),
	);

	const CHIP_TONE: Record<ChipTone, string> = {
		neutral: "bg-secondary text-ink-700",
		ok: "bg-[var(--type-einnahme-tint)] text-[color:var(--einnahme-ink-aa)]",
		warn: "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
	};
</script>

<div
	class="relative overflow-hidden rounded-2xl border border-hairline bg-card shadow-card"
	data-slot="detail-head"
	data-kind={kind}
>
	<div class="h-[3px] bg-gradient-brand" aria-hidden="true"></div>
	<div class="p-5 sm:p-6">
		<div class="flex flex-wrap items-start gap-x-4 gap-y-2">
			<!-- type-tinted icon tile -->
			<div
				class="grid size-12 shrink-0 place-items-center rounded-xl"
				style="background: var({p.tintVar}); color: var({p.typeVar});"
				aria-hidden="true"
			>
				{#if kind === "expense"}
					<ArrowDownRight class="size-6" />
				{:else if kind === "income"}
					<ArrowUpRight class="size-6" />
				{:else}
					<HandCoins class="size-6" />
				{/if}
			</div>

			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span
						class="whitespace-nowrap rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs font-semibold text-ink-700"
						data-slot="detail-id-chip">{businessId}</span
					>
					<span
						class="whitespace-nowrap text-xs font-semibold uppercase tracking-wide"
						style="color: var({p.typeVar});">{p.label}</span
					>
					{#if compact && statusChip}
						{@render chip(statusChip)}
					{/if}
				</div>
				<h1
					class="mt-1 truncate text-[21px] font-bold tracking-[-0.01em] text-ink-900"
					title={title}
				>
					{title}
				</h1>
			</div>

			<div
				class="shrink-0 text-right max-sm:order-3 max-sm:basis-full max-sm:pl-16 max-sm:text-left"
			>
				<div
					class="text-[30px] font-extrabold leading-none tracking-[-0.02em] tabular-nums sm:text-[36px]"
					style="color: var({p.typeVar});"
					data-slot="detail-amount"
				>
					{p.sign}{amount}
				</div>
				<div class="mt-1 text-xs font-medium text-ink-500">Betrag</div>
			</div>
		</div>

		{#if !compact && (statusChip || meta || actions)}
			<div
				class="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-hairline pt-4"
				data-slot="detail-head-actions"
			>
				{#if statusChip}
					{@render chip(statusChip)}
				{/if}
				{#if meta}
					<span class="min-w-0 text-[13px] text-ink-500">{meta}</span>
				{/if}
				<span class="flex-1"></span>
				{@render actions?.()}
			</div>
		{/if}
	</div>
</div>

{#snippet chip(c: DetailStatusChip)}
	<span
		class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold {CHIP_TONE[
			c.tone
		]}"
		data-slot="detail-status-chip"
		data-tone={c.tone}
	>
		{#if c.icon === "refresh"}
			<RefreshCw class="size-3.5" aria-hidden="true" />
		{:else if c.icon === "check"}
			<Check class="size-3.5" aria-hidden="true" />
		{:else if c.icon === "lock"}
			<Lock class="size-3.5" aria-hidden="true" />
		{:else if c.icon === "alert"}
			<TriangleAlert class="size-3.5" aria-hidden="true" />
		{/if}
		{c.label}
	</span>
{/snippet}

<!--
	MemberAuslageRow — one row in the member portal's "Meine Auslagen" list
	(Aurora A-flow S2a). Read-only: it carries a submission's title, AUS-Nr,
	Rechnungsdatum, amount (ALWAYS plum — the chip carries the tone, never the
	number), and status chip. S2a has no member detail route yet, so the row is
	a display row (no link); it becomes a link to /portal/auslagen/[id] in S2b.

	Layout (Board #163 J-M1): the title must NOT lose to a fixed chip column on
	narrow phones (Andy Rule 2 — field width = content). So under `sm` the row
	STACKS — the title keeps the full column width, and amount · chip drop to
	their own line below. At `sm`+ it's the single-row ledger layout.
-->
<script lang="ts">
	import { Receipt } from '@lucide/svelte';
	import { formatMoney } from '$lib/components/ui/money/money.svelte';
	import AuslageStatusChip from '$lib/components/ui/AuslageStatusChip.svelte';
	import { statusPresentation } from '$lib/components/auslagen/status-presentation.js';
	import type { AuslageStatus } from '$lib/server/domain/auslage-status.js';

	interface Props {
		businessId: string;
		bezeichnung: string;
		betragCents: number;
		rechnungsdatum: string | null;
		status: AuslageStatus;
		/** Detail route (S2b). Omit for a plain display row. */
		href?: string | null;
	}

	let {
		businessId,
		bezeichnung,
		betragCents,
		rechnungsdatum,
		status,
		href = null
	}: Props = $props();

	const presentation = $derived(statusPresentation(status));

	// Compact date; show a 2-digit year only when the Rechnung is NOT from the
	// current year (Board #163 optional b — a bare "05.06." is ambiguous across
	// years).
	const shortDate = $derived.by(() => {
		if (!rechnungsdatum) return null;
		const d = new Date(`${rechnungsdatum}T00:00:00`);
		const sameYear = d.getFullYear() === new Date().getFullYear();
		return d.toLocaleDateString(
			'de-DE',
			sameYear
				? { day: '2-digit', month: '2-digit' }
				: { day: '2-digit', month: '2-digit', year: '2-digit' }
		);
	});
</script>

{#snippet amountEl()}
	<span class="shrink-0 text-sm font-semibold tabular-nums text-type-ausgabe"
		>{formatMoney(betragCents)}</span
	>
{/snippet}

{#snippet chipEl()}
	<AuslageStatusChip variant={presentation.chip} label={presentation.pill} />
{/snippet}

{#snippet rowBody()}
	<span
		class="grid size-9 shrink-0 place-items-center self-start rounded-full bg-type-ausgabe-tint text-type-ausgabe sm:self-center [&_svg]:size-4"
		aria-hidden="true"
	>
		<Receipt />
	</span>

	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-3">
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm font-semibold text-ink-900">{bezeichnung}</div>
				<div class="truncate text-xs tabular-nums text-ink-500">{businessId}</div>
			</div>

			<!-- Desktop: date · amount · chip inline on the right -->
			<div class="hidden items-center gap-3 sm:flex">
				{#if shortDate}
					<span class="shrink-0 text-xs tabular-nums text-ink-500">{shortDate}</span>
				{/if}
				{@render amountEl()}
				<span class="flex w-[112px] justify-end">{@render chipEl()}</span>
			</div>
		</div>

		<!-- Mobile: amount · chip drop below the (full-width) title -->
		<div class="mt-1.5 flex items-center gap-2.5 sm:hidden">
			{@render amountEl()}
			{@render chipEl()}
		</div>
	</div>
{/snippet}

<!--
	The listitem wraps the link rather than being it: an <a role="listitem">
	would trade away the link semantics that make the row keyboard- and
	screen-reader-navigable.
-->
<div role="listitem" data-testid="member-auslage-row" data-status={status}>
	{#if href}
		<!-- eslint-disable svelte/no-navigation-without-resolve -- caller-supplied in-app portal route -->
		<a
			{href}
			class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:-outline-offset-2 focus-visible:outline-none"
			data-testid="member-auslage-link"
		>
			{@render rowBody()}
		</a>
	{:else}
		<div class="flex items-center gap-3 px-4 py-3">
			{@render rowBody()}
		</div>
	{/if}
</div>
